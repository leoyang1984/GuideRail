import { mkdirSync, readFileSync, readdirSync, lstatSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version in package.json');

const cwsDir = resolve('release/cws');
mkdirSync(cwsDir, { recursive: true });

const targetZip = resolve(cwsDir, `GuideRail-v${version}-cws.zip`);

// Verify dist has no symlinks and contains manifest.json
const distDir = resolve('dist');
function check(path) {
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Unexpected symlink in dist: ${path}`);
  if (lstatSync(path).isDirectory()) {
    for (const name of readdirSync(path)) check(`${path}/${name}`);
  }
}
check(distDir);

// Package dist directory contents directly into the zip
execFileSync('zip', ['-X', '-q', '-r', targetZip, '.'], { cwd: distDir });

const sizeKb = (statSync(targetZip).size / 1024).toFixed(1);
console.log(`\n🎉 Successfully packaged Chrome Web Store release:`);
console.log(`   Path: ${targetZip}`);
console.log(`   Size: ${sizeKb} KB\n`);
