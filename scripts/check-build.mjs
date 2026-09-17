import { readFile, access, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, JSON.parse(await readFile('package.json', 'utf8')).version);
await access('dist/LICENSE');
await access('dist/THIRD_PARTY_NOTICES.txt');
const workerPath = `dist/${manifest.background.service_worker}`;
await access(workerPath);
const worker = await readFile(workerPath, 'utf8');
for (const [, dependency] of worker.matchAll(/\bfrom["'](\.\/[^"']+)["']/g)) await access(resolve(dirname(workerPath), dependency));
const html = await readFile(`dist/${manifest.side_panel.default_path}`, 'utf8');
assert(!html.includes('.tsx'), 'Uncompiled source in extension HTML');
for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  await access(new URL(asset, new URL(`../dist/${manifest.side_panel.default_path}`, import.meta.url)));
}
const expectedAssets = new Set(['messages.js', 'service-worker.js', 'sidepanel.css', 'sidepanel.js', 'storage.js', 'turndown-plugin-gfm.es.js', 'core.js', 'i18n.js']);
for (const asset of await readdir('dist/assets')) assert(expectedAssets.has(asset), `Unexpected build asset: ${asset}`);
console.log('Extension manifest and bundled entry points verified.');

for (const script of manifest.content_scripts ?? []) for (const file of script.js) {
  const text = await readFile(`dist/${file}`, 'utf8');
  assert(!/\bimport\s*(?:\{|[\"'])/.test(text), 'Content script must be self-contained');
  assert(!text.includes('process.env'), 'Content script must not reference process.env');
}
