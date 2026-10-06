#!/usr/bin/env node
// Exports the approved-content dictionaries for human review: one JSON file
// per locale plus a side-by-side CSV (key, en-CA, fr-CA) for the qualified
// Canadian French reviewer. Usage: node tools/export-content.mjs [outDir]
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(root, 'docs/content');
const files = readdirSync(join(root, 'src/content')).filter((f) => f.endsWith('.js')).sort((a, b) => (a === 'core.js' ? -1 : b === 'core.js' ? 1 : a.localeCompare(b)));
const dicts = { 'en-CA': {}, 'fr-CA': {} };
const sandbox = { App: { i18n: { register: (ns, by) => { dicts['en-CA'][ns] = by['en-CA']; dicts['fr-CA'][ns] = by['fr-CA']; } } }, console };
vm.createContext(sandbox);
for (const f of files) vm.runInContext(readFileSync(join(root, 'src/content', f), 'utf8'), sandbox, { filename: f });

const flat = (o, prefix = '', out = {}) => {
  if (typeof o === 'string' || typeof o === 'number') { out[prefix] = String(o); return out; }
  if (Array.isArray(o)) { o.forEach((v, i) => flat(v, `${prefix}[${i}]`, out)); return out; }
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
};
const en = flat(dicts['en-CA']);
const fr = flat(dicts['fr-CA']);
const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const rows = [['key', 'en-CA', 'fr-CA', 'reviewer_notes'].join(',')];
for (const k of Object.keys(en)) rows.push([esc(k), esc(en[k]), esc(fr[k]), '""'].join(','));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'content.en-CA.json'), JSON.stringify(dicts['en-CA'], null, 2));
writeFileSync(join(outDir, 'content.fr-CA.json'), JSON.stringify(dicts['fr-CA'], null, 2));
writeFileSync(join(outDir, 'content-review.csv'), `﻿${rows.join('\n')}\n`);
const narration = JSON.parse(readFileSync(join(root, 'src/content/narration.json'), 'utf8'));
writeFileSync(join(outDir, 'narration-scripts.md'), [
  '# Narration scripts (frozen for creation-time synthesis)',
  '',
  `Model: ${narration.model} · format ${narration.outputFormat}`,
  '',
  ...['en-CA', 'fr-CA'].flatMap((l) => [`## ${l} — voice: ${narration.voices[l].voiceName}`, '', `> ${narration.voices[l].note}`, '', ...narration.scripts[l].map((p, i) => `${i + 1}. **${narration.chapters[i]}** — ${p}`), '']),
].join('\n'));
console.log(`Exported ${Object.keys(en).length} strings (${Object.keys(dicts['en-CA']).length} namespaces) to ${outDir}`);
