#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { verifyDatasetRecord } = require('../src/training');

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const arg of argv) {
    const m = /^--([a-z0-9-]+)=(.+)$/i.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function verifyJsonlFile(inputPath, outputPath) {
  const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
  const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
  const accepted = [];
  /** @type {Record<string, number>} */
  const errorCounts = {};
  let rejectedCount = 0;

  for (const line of lines) {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      rejectedCount++;
      errorCounts.INVALID_JSON_LINE = (errorCounts.INVALID_JSON_LINE ?? 0) + 1;
      continue;
    }
    const report = verifyDatasetRecord(record);
    if (report.valid) {
      accepted.push(JSON.stringify(record));
    } else {
      rejectedCount++;
      for (const err of report.errors) {
        errorCounts[err.code] = (errorCounts[err.code] ?? 0) + 1;
      }
    }
  }

  if (outputPath) {
    const resolvedOut = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, accepted.length ? `${accepted.join('\n')}\n` : '', 'utf8');
  }

  return {
    totalLines: lines.length,
    acceptedCount: accepted.length,
    rejectedCount,
    acceptRate: lines.length ? Number((accepted.length / lines.length).toFixed(4)) : 0,
    errorCounts,
  };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Cách dùng: node scripts/verify-dataset.js --input=<duong-dan.jsonl> [--output=<clean.jsonl>]');
    process.exit(1);
  }
  const summary = verifyJsonlFile(args.input, args.output);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.acceptedCount === 0 && summary.totalLines > 0) {
    process.exitCode = 1;
  }
}

module.exports = { verifyJsonlFile };
