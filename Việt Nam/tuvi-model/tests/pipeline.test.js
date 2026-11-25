'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const core = require('../../tuvi-core');
const {
  interpretNatal,
  createMockAdapter,
  createOpenAICompatibleAdapter,
  INTERPRETATION_SCHEMA_VERSION,
} = require('../src');
const { runEval } = require('../eval/run-eval');

function buildSampleNatal() {
  const profile = core.getProfile('thienky-candidate');
  /** @type {import('../../tuvi-core').BirthInput} */
  const birth = { calendar: 'solar', date: '1990-01-01', time: '12:30', tz: 'Asia/Ho_Chi_Minh', gender: 'male' };
  const norm = core.normalizeBirth(birth, profile);
  assert.equal(norm.status, 'ok');
  return /** @type {any} */ ({
    ...core.computeNatal(norm.chart, profile),
    normalization: { input: birth, chart: norm.chart, audit: norm.audit, warnings: norm.warnings },
  });
}

test('interpretNatal với MockModelAdapter vượt qua kiểm định assertions cấu trúc và đo cờ quyền riêng tư thật', async () => {
  const natal = buildSampleNatal();
  const output = await interpretNatal(natal, {
    adapter: createMockAdapter(),
    question: 'Cấu trúc cung Mệnh và Tứ Hóa?',
    extraSensitiveValues: ['Trần Văn A'],
  });

  assert.equal(output.schemaVersion, INTERPRETATION_SCHEMA_VERSION);
  assert.equal(output.adapter.kind, 'mock');
  assert.equal(output.attempts, 1);
  assert.equal(output.validation.valid, true, JSON.stringify(output.validation.errors));
  assert.equal(output.privacy.directBirthIdentifiersStripped, true);
  assert.equal(output.privacy.structuralReidentificationRisk, 'non-zero');
  assert.ok(output.promptChars < 10_000);
  assert.ok(output.retrievedQuotes.length > 0);
  assert.ok(output.interpretation && output.interpretation.claims.length >= 5);
});

test('createOpenAICompatibleAdapter chặn endpoint từ xa bằng mã REMOTE_ENDPOINT_BLOCKED khi chưa bật allowRemote', () => {
  assert.throws(
    () => createOpenAICompatibleAdapter({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }),
    err => /** @type {any} */ (err).code === 'REMOTE_ENDPOINT_BLOCKED',
  );

  const remote = createOpenAICompatibleAdapter({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    allowRemote: true,
  });
  assert.equal(remote.kind, 'remote');
});

test('OpenAICompatibleAdapter retry cả lỗi JSON hỏng (JSON_PARSE_ERROR) lẫn ảo giác vị trí sao, và trả interpretation=null nếu hết lượt retry', async () => {
  const natal = buildSampleNatal();
  const mingFact = natal.facts.find(f => f.subjectId === 'CHART.MING' && f.predicate === 'LOCATED_AT_BRANCH');
  const tianliangFact = natal.facts.find(f => f.subjectId === 'STAR.TIANLIANG' && f.objectId === 'PALACE.MING');

  let callCount = 0;
  /** @type {any[]} */
  const receivedBodies = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      receivedBodies.push(body);
      callCount++;

      let content;
      if (callCount === 1) {
        // Attempt 1: broken JSON syntax -> must trigger JSON_PARSE_ERROR retry, NOT crash!
        content = '```json\n{ "schemaVersion": "tuvi.interpretation.v0", BROKEN_JSON \n```';
      } else if (callCount === 2) {
        // Attempt 2: valid JSON syntax, but hallucinates Tử Vi in Mệnh -> must trigger validator retry!
        content = JSON.stringify({
          schemaVersion: INTERPRETATION_SCHEMA_VERSION,
          summary: 'Tử Vi cư Mệnh rất sáng.',
          reasoningSteps: ['Quét Mệnh cung'],
          claims: [{
            id: 'CLAIM.1',
            category: 'menh-than',
            statement: 'Tử Vi cư Mệnh.',
            assertions: [{ subjectId: 'STAR.ZIWEI', predicate: 'LOCATED_IN', objectId: 'PALACE.MING' }],
            factIds: ['STAR.FAKE@PALACE.MING'],
            confidence: 'high',
          }],
          actionGuidance: ['Hành động thực tế.'],
          disclaimer: 'Tham khảo.',
        });
      } else {
        // Attempt 3: self-corrected structured response matching engine facts
        content = JSON.stringify({
          schemaVersion: INTERPRETATION_SCHEMA_VERSION,
          summary: 'Thiên Lương tọa thủ Mệnh tại cung Mùi.',
          reasoningSteps: ['Đã hiệu chỉnh theo facts engine: Thiên Lương tại Mệnh.'],
          claims: [{
            id: 'CLAIM.1',
            category: 'menh-than',
            statement: 'Thiên Lương tọa thủ Mệnh tại cung Mùi.',
            assertions: [
              { subjectId: mingFact.subjectId, predicate: mingFact.predicate, objectId: mingFact.objectId },
              { subjectId: tianliangFact.subjectId, predicate: tianliangFact.predicate, objectId: tianliangFact.objectId },
            ],
            factIds: [mingFact.id, tianliangFact.id],
            quoteIds: [],
            confidence: 'high',
          }],
          actionGuidance: ['Cải vận bằng hành vi thực tế, không mê tín.'],
          disclaimer: 'Tham khảo học thuật.',
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const addr = /** @type {import('node:net').AddressInfo} */ (server.address());

  try {
    const adapter = createOpenAICompatibleAdapter({
      baseUrl: `http://127.0.0.1:${addr.port}/v1`,
      model: 'local-test-model',
    });

    const result = await interpretNatal(natal, { adapter, maxRetries: 2 });
    assert.equal(callCount, 3);
    assert.equal(result.attempts, 3);
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.errors));
    assert.notEqual(result.interpretation, null);

    // Verify Attempt 2 prompt received JSON_PARSE_ERROR feedback, and Attempt 3 received ASSERTION_NOT_IN_FACTS / STAR_PALACE_CONTRADICTION
    assert.match(JSON.stringify(receivedBodies[1].messages), /JSON_PARSE_ERROR/);
    assert.match(JSON.stringify(receivedBodies[2].messages), /ASSERTION_NOT_IN_FACTS/);
    assert.match(JSON.stringify(receivedBodies[2].messages), /STAR_PALACE_CONTRADICTION/);

    // Verify exhausted retries NEVER expose an invalid interpretation
    callCount = 0;
    const exhausted = await interpretNatal(natal, { adapter, maxRetries: 1 });
    assert.equal(exhausted.validation.valid, false);
    assert.equal(exhausted.interpretation, null);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Bộ eval 2 tầng đạt 100% adversarialRecall, 0% falsePositiveRate và prompt gọn dưới 12 KB', async () => {
  const report = await runEval({ mode: 'mock' });
  assert.equal(report.summary.corpusQuotes, 1848);
  assert.equal(report.summary.adversarialRecall, 1);
  assert.equal(report.summary.falsePositiveRate, 0);
  assert.equal(report.summary.smokePassRate, 1);
  assert.ok(report.summary.maxPromptChars < 12_000);
  assert.equal(report.summary.privacyFailures, 0);
});

test('adapter thử lại khi HTTP 200 chứa body hỏng và từ chối chuyển hướng', async () => {
  const natal = buildSampleNatal();
  const attempts = [];
  const adapter = createOpenAICompatibleAdapter({
    baseUrl: 'http://127.0.0.1:11434/v1',
    fetchImpl: async (_url, init) => {
      attempts.push(init);
      return new Response('Provider returned a non-JSON response.', { status: 200 });
    },
  });

  const result = await interpretNatal(natal, { adapter, maxRetries: 1 });
  assert.equal(attempts.length, 2);
  assert.ok(attempts.every(init => init.redirect === 'error'));
  assert.match(attempts[1].body, /JSON_PARSE_ERROR/);
  assert.equal(result.validation.errors[0].code, 'JSON_PARSE_ERROR');
  assert.equal(result.interpretation, null);
});
