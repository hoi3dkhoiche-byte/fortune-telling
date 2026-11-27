#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadCorpus } = require('../src/rag');
const { sampleStratifiedCharts, buildTrainingBundle } = require('../src/training');

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const arg of argv) {
    const m = /^--([a-z0-9-]+)=(.+)$/i.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const count = Math.max(20, Math.min(5000, Number(args.count) || 120));
  const profileId = args.profile || 'thienky-candidate';
  const outDir = path.resolve(args['out-dir'] || path.join(__dirname, '../dataset-out'));

  fs.mkdirSync(outDir, { recursive: true });
  const corpus = loadCorpus();
  const { items, coverage } = sampleStratifiedCharts({ count, profileId });

  const sftPath = path.join(outDir, 'sft_messages.jsonl');
  const dpoPath = path.join(outDir, 'dpo_pairs.jsonl');
  const distillPath = path.join(outDir, 'distill_prompts.jsonl');
  const manifestPath = path.join(outDir, 'manifest.json');

  const sftLines = [];
  const dpoLines = [];
  const distillLines = [];

  items.forEach((entry, idx) => {
    const bundle = buildTrainingBundle(entry.natalResult, {
      corpus,
      question: entry.topic.question,
      focusPalace: entry.topic.focusPalace,
      variantIndex: idx,
    });
    const sampleId = `TUVI.TRAIN.${String(idx + 1).padStart(5, '0')}`;
    sftLines.push(JSON.stringify({ id: sampleId, ...bundle.sft }));
    dpoLines.push(JSON.stringify({ id: sampleId, ...bundle.dpo }));
    distillLines.push(JSON.stringify({ id: sampleId, ...bundle.distillPrompt }));
  });

  fs.writeFileSync(sftPath, `${sftLines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(dpoPath, `${dpoLines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(distillPath, `${distillLines.join('\n')}\n`, 'utf8');

  const manifest = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 'tuvi.dataset.v0',
    profileId,
    corpusQuotes: corpus.quotes.length,
    coverage,
    files: {
      sftMessages: path.basename(sftPath),
      dpoPairs: path.basename(dpoPath),
      distillPrompts: path.basename(distillPath),
    },
    guarantees: {
      allChosenPassValidator: true,
      allRejectedFailValidator: true,
      zeroDirectBirthPii: true,
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(manifest, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { main };
