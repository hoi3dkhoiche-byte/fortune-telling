'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  sampleStratifiedCharts,
  buildTrainingBundle,
  verifyDatasetRecord,
  buildResponseJsonSchema,
  loadCorpus,
  probeModelEndpoint,
  createOpenAICompatibleAdapter,
  interpretNatal,
} = require('../src');
const { verifyJsonlFile } = require('../scripts/verify-dataset');

test('sampleStratifiedCharts và buildTrainingBundle phủ đủ 14 chính tinh, 10 Thiên Can, 5 Cục và sinh SFT + DPO hợp lệ 100%', () => {
  const corpus = loadCorpus();
  const { items, coverage } = sampleStratifiedCharts({ count: 60 });
  assert.equal(items.length, 60);
  assert.equal(coverage.majorStarsCovered, 14, 'Must cover all 14 major stars in Ming');
  assert.equal(coverage.stemsCovered, 10, 'Must cover all 10 Heavenly Stems (Tứ Hóa tables)');
  assert.equal(coverage.wuxingJuCovered, 5, 'Must cover all 5 Ngũ Hành Cục');
  assert.ok(coverage.emptyMingCharts >= 2, 'Must include empty-Ming charts');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuvi-train-test-'));
  try {
    const jsonlLines = [];
    const seenRejectCodes = new Set();

    for (let i = 0; i < 15; i++) {
      const bundle = buildTrainingBundle(items[i].natalResult, {
        corpus,
        question: items[i].topic.question,
        focusPalace: items[i].topic.focusPalace,
        variantIndex: i,
      });

      // Verify SFT record passes standalone dataset verifier (including <think> extraction + validator + PII scan)
      const sftCheck = verifyDatasetRecord(bundle.sft);
      assert.equal(sftCheck.valid, true, JSON.stringify(sftCheck.errors));

      // Verify DPO rejected variant fails standalone dataset verifier
      const dpoRejectedRecord = {
        messages: [...bundle.dpo.prompt, ...bundle.dpo.rejected],
      };
      const rejectedCheck = verifyDatasetRecord(dpoRejectedRecord);
      assert.equal(rejectedCheck.valid, false);
      seenRejectCodes.add(bundle.dpo.rejectionCode);

      // Verify dynamic JSON schema locks factIds enum and quoteIds enum
      const schemaProps = /** @type {any} */ (bundle.distillPrompt.responseJsonSchema.schema.properties);
      const claimItems = schemaProps.claims.items.properties;
      assert.ok(Array.isArray(claimItems.factIds.items.enum) && claimItems.factIds.items.enum.length > 0);

      jsonlLines.push(JSON.stringify(bundle.sft));
    }

    // All 5 DPO failure modes covered across 15 samples
    assert.equal(seenRejectCodes.size, 5);

    // Add 1 intentionally corrupted Teacher output line to verify verifyJsonlFile filters cleanly
    const badRecord = JSON.parse(jsonlLines[0]);
    badRecord.messages[2].content = '<think>Sai</think>\n' + JSON.stringify({
      schemaVersion: 'tuvi.interpretation.v0',
      summary: 'Tử Vi cư Phụ Mẫu, nên đi cúng sao giải hạn.',
      reasoningSteps: ['Bước 1'],
      claims: [],
      actionGuidance: ['Đi mua bùa bình an.'],
      disclaimer: 'Test',
    });
    jsonlLines.push(JSON.stringify(badRecord));

    const inFile = path.join(tmpDir, 'raw.jsonl');
    const outFile = path.join(tmpDir, 'clean.jsonl');
    fs.writeFileSync(inFile, `${jsonlLines.join('\n')}\n`, 'utf8');

    const verifyReport = verifyJsonlFile(inFile, outFile);
    assert.equal(verifyReport.totalLines, 16);
    assert.equal(verifyReport.acceptedCount, 15);
    assert.equal(verifyReport.rejectedCount, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('buildResponseJsonSchema khóa quoteIds=[] khi không có trích dẫn và structuredOutputs tự fallback về json_object khi server trả 400', async () => {
  const emptySchema = buildResponseJsonSchema({ promptFacts: [{ id: 'CHART.MING@BRANCH.WEI' }] }, []);
  const quoteProp = /** @type {any} */ (emptySchema.schema.properties).claims.items.properties.quoteIds;
  assert.equal(quoteProp.maxItems, 0);

  const formatsSeen = [];
  const sampleItems = sampleStratifiedCharts({ count: 20 }).items;
  const sampleNatal = sampleItems[0].natalResult;
  const bundle = buildTrainingBundle(sampleNatal);

  const adapter = createOpenAICompatibleAdapter({
    baseUrl: 'http://127.0.0.1:11434/v1',
    structuredOutputs: true,
    fetchImpl: async (_url, init) => {
      const parsedBody = JSON.parse(String(init?.body || '{}'));
      formatsSeen.push(parsedBody.response_format?.type);
      if (parsedBody.response_format?.type === 'json_schema') {
        return new Response(JSON.stringify({ error: 'json_schema unsupported' }), { status: 400 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: bundle.sft.messages[2].content } }],
      }), { status: 200 });
    },
  });

  const out = await interpretNatal(sampleNatal, { adapter });
  assert.deepEqual(formatsSeen, ['json_schema', 'json_object']);
  assert.equal(out.validation.valid, true);

  // Verify probeModelEndpoint refuses remote URLs by default and parses local /models cleanly
  const blocked = await probeModelEndpoint({ baseUrl: 'https://api.example.com/v1' });
  assert.equal(blocked.reachable, false);
  assert.equal(blocked.blockedRemote, true);

  const okProbe = await probeModelEndpoint({
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'tuvi-thienky:14b',
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'tuvi-thienky:14b' }] }), { status: 200 }),
  });
  assert.equal(okProbe.reachable, true);
  assert.equal(okProbe.modelLoaded, true);
  assert.deepEqual(okProbe.availableModels, ['tuvi-thienky:14b']);
});
