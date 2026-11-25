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

test('interpretNatal với MockModelAdapter vượt qua 100% kiểm định sự thật và không gửi PII', async () => {
  const natal = buildSampleNatal();
  const output = await interpretNatal(natal, {
    adapter: createMockAdapter(),
    question: 'Tính cách và cách cải vận?',
    extraSensitiveValues: ['Trần Văn A'],
  });

  assert.equal(output.schemaVersion, INTERPRETATION_SCHEMA_VERSION);
  assert.equal(output.adapter.kind, 'mock');
  assert.equal(output.attempts, 1);
  assert.equal(output.validation.valid, true, JSON.stringify(output.validation.errors));
  assert.equal(output.privacy.birthDataSentToModel, false);
  assert.ok(output.retrievedQuotes.length > 0);
  assert.ok(output.interpretation.claims.length >= 5);
});

test('createOpenAICompatibleAdapter chặn endpoint từ xa khi chưa bật allowRemote', () => {
  assert.throws(
    () => createOpenAICompatibleAdapter({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }),
    /Chặn kết nối model từ xa/,
  );

  // Allowed when explicitly opted-in (still guarded by assertNoBirthPii inside pipeline)
  const remote = createOpenAICompatibleAdapter({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    allowRemote: true,
  });
  assert.equal(remote.kind, 'remote');
});

test('OpenAICompatibleAdapter tự sửa lỗi ảo giác qua vòng retry với phản hồi của Fact-Checking Validator', async () => {
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

      // First call deliberately hallucinates Tử Vi in Mệnh + fake factId; second call self-corrects after validator feedback!
      const content = callCount === 1
        ? `<think>Đang thử suy luận ban đầu</think>\n\`\`\`json\n${JSON.stringify({
            schemaVersion: INTERPRETATION_SCHEMA_VERSION,
            summary: 'Tử Vi tọa thủ Mệnh mang cách đế tinh.',
            reasoningSteps: ['Quét Mệnh cung'],
            claims: [{
              id: 'CLAIM.1',
              category: 'menh-than',
              statement: 'Tử Vi tọa thủ Mệnh nên rất quyền uy.',
              factIds: ['STAR.FAKE@PALACE.MING'],
              confidence: 'high',
            }],
            actionGuidance: ['Hành động dứt khoát.'],
            disclaimer: 'Tham khảo.',
          })}\n\`\`\``
        : JSON.stringify({
            schemaVersion: INTERPRETATION_SCHEMA_VERSION,
            summary: 'Thiên Lương tọa thủ Mệnh tại cung Mùi.',
            reasoningSteps: ['Đã hiệu chỉnh theo facts engine: Thiên Lương tại Mệnh.'],
            claims: [{
              id: 'CLAIM.1',
              category: 'menh-than',
              statement: 'Thiên Lương tọa thủ Mệnh tại cung Mùi.',
              factIds: [mingFact.id, tianliangFact.id],
              confidence: 'high',
            }],
            actionGuidance: ['Cải vận bằng hành vi thực tế, không mê tín.'],
            disclaimer: 'Tham khảo học thuật.',
          });

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
    assert.equal(adapter.kind, 'local');

    const result = await interpretNatal(natal, { adapter, maxRetries: 2 });
    assert.equal(callCount, 2);
    assert.equal(result.attempts, 2);
    assert.equal(result.validation.valid, true, JSON.stringify(result.validation.errors));
    // Verify second request received validator feedback about both UNKNOWN_FACT_ID and STAR_PALACE_CONTRADICTION
    const secondPrompt = JSON.stringify(receivedBodies[1].messages);
    assert.match(secondPrompt, /STAR_PALACE_CONTRADICTION/);
    assert.match(secondPrompt, /UNKNOWN_FACT_ID/);
    // Verify NO birth date or time ever reached the HTTP server
    assert.doesNotMatch(JSON.stringify(receivedBodies), /1990-01-01/);
    assert.doesNotMatch(JSON.stringify(receivedBodies), /Asia\/Ho_Chi_Minh/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Bộ eval 10 ca benchmark đạt 100% pass, 0 ảo giác và 0 rò rỉ PII', async () => {
  const report = await runEval({ mode: 'mock' });
  assert.equal(report.summary.corpusQuotes, 1848);
  assert.equal(report.summary.passedCases, report.summary.totalCases);
  assert.equal(report.summary.factGroundingRate, 1);
  assert.equal(report.summary.hallucinationCount, 0);
  assert.equal(report.summary.doctrineViolationCount, 0);
  assert.equal(report.summary.privacyFailures, 0);
});
