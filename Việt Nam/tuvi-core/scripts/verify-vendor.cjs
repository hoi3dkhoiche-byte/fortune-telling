const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const root = resolve(__dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'vendor/manifest.json'), 'utf8'));
const mismatches = [];
for (const entry of manifest.files) {
  const actual = createHash('sha256').update(readFileSync(resolve(root, 'vendor/ziwei', entry.file))).digest('hex');
  if (actual !== entry.sha256) mismatches.push(entry.file);
}
const snapshot = createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex');
if (snapshot !== manifest.snapshotSha256) mismatches.push('manifest.snapshotSha256');
if (mismatches.length) {
  console.error(`Vendor đã thay đổi: ${mismatches.join(', ')}`);
  process.exitCode = 1;
} else console.log(`OK: ${manifest.files.length} file vendor nguyên trạng; ${snapshot}`);
