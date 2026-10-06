#!/usr/bin/env node
// Runs every tests/modules/*.mjs script against the full build (or a given file).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || join(here, '../dist/index.html');
const scripts = readdirSync(join(here, 'modules')).filter((f) => f.endsWith('.mjs')).sort();
let failed = 0;
for (const s of scripts) {
  const started = Date.now();
  const r = spawnSync(process.execPath, [join(here, 'modules', s), file], { encoding: 'utf8', timeout: 600000 });
  const ok = r.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${s} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  if (!ok) console.log((r.stdout || '').split('\n').filter((l) => /✗|Error|error|fail/i.test(l)).slice(0, 25).map((l) => `    ${l}`).join('\n'), (r.stderr || '').slice(0, 1500));
}
console.log(failed ? `\n${failed} module test file(s) failed` : `\n✓ all ${scripts.length} module test files passed`);
process.exit(failed ? 1 : 0);
