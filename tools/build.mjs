#!/usr/bin/env node
// Packages the source project into ONE self-contained index.html: styles,
// scripts, validated synthetic record, bilingual content, logo and both
// pre-generated narration tracks with their cue manifests.
//
// Usage: node tools/build.mjs [--out dist/index.html] [--silent-audio] [--quiet]
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import vm from 'node:vm';
import { loadAndValidateFixture } from './fixture.mjs';
import { scriptHash } from './generate-voiceover.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const args = process.argv.slice(2);
const outPath = args.includes('--out') ? resolve(process.cwd(), args[args.indexOf('--out') + 1]) : join(root, 'dist/index.html');
const silentAudio = args.includes('--silent-audio');
// --modules a,b: build core + only these feature modules (isolated agent builds)
const onlyModules = args.includes('--modules') ? args[args.indexOf('--modules') + 1].split(',').map((m) => m.trim()).filter(Boolean) : null;
const CORE_JS = /^(0\d|10|99)-/;
const CORE_CSS = /^(0\d|90)-/;
const moduleName = (f) => f.replace(/^\d+-/, '').replace(/\.(js|css)$/, '');
const wanted = (f, coreRe) => !onlyModules || (coreRe && coreRe.test(f)) || onlyModules.some((m) => moduleName(f) === m || moduleName(f).startsWith(`${m}-`));
const quiet = args.includes('--quiet');
const log = (...m) => { if (!quiet) console.log(...m); };
const errors = [];
const warnings = [];

const read = (p) => readFileSync(p, 'utf8');
const list = (dir, ext) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).sort() : []);
const safeJSON = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// 1. Issued record: regenerate + reconcile schedules, freeze derived values
let record;
try {
  record = loadAndValidateFixture(join(src, 'data/fixture.json'));
  log('✓ fixture validated (60 / 63 rows, totals reconciled)');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// 2. Narration: cue manifests must match the frozen scripts they were generated from
const locales = ['en-CA', 'fr-CA'];
const cues = {};
const audioTags = [];
for (const l of locales) {
  const cuePath = join(src, `assets/audio/cues-${l}.json`);
  const mp3Path = join(src, `assets/audio/narration-${l}.mp3`);
  if (!existsSync(cuePath) || !existsSync(mp3Path)) {
    errors.push(`missing narration assets for ${l} (run tools/generate-voiceover.mjs)`);
    continue;
  }
  const c = JSON.parse(read(cuePath));
  if (c.scriptHash !== scriptHash(l)) errors.push(`${l} narration audio is stale: script/voice/model changed since synthesis`);
  // keep only what the player needs
  cues[l] = { locale: l, duration: c.duration, chapters: c.chapters.map(({ id, index, start, end, speechStart, speechEnd }) => ({ id, index, start, end, speechStart, speechEnd })), captions: c.captions, marks: c.marks, voice: { name: c.voice.voiceName }, model: c.model, generatedAt: c.generatedAt };
  if (!silentAudio) {
    const b64 = readFileSync(mp3Path).toString('base64');
    audioTags.push(`<script type="text/plain" id="audio-${l}" data-mime="audio/mpeg">${b64}</script>`);
  }
}

// 3. Styles
const cssFiles = list(join(src, 'styles'), '.css').filter((f) => wanted(f, CORE_CSS));
const css = cssFiles.map((f) => `/* ${f} */\n${read(join(src, 'styles', f))}`).join('\n');

// 4. Scripts: core (00,01) → content dictionaries → remaining modules
const jsFiles = list(join(src, 'js'), '.js').filter((f) => wanted(f, CORE_JS));
const contentFiles = list(join(src, 'content'), '.js').filter((f) => f === 'core.js' || wanted(f, null)).sort((a, b) => (a === 'core.js' ? -1 : b === 'core.js' ? 1 : a.localeCompare(b)));
const early = jsFiles.filter((f) => /^0[01]-/.test(f));
const late = jsFiles.filter((f) => !/^0[01]-/.test(f));
const ordered = [...early.map((f) => ['js', f]), ...contentFiles.map((f) => ['content', f]), ...late.map((f) => ['js', f])];
const bundleParts = ordered.map(([dir, f]) => `\n/* ---- ${dir}/${f} ---- */\n${read(join(src, dir, f))}\n`);
const js = `(function () {\n'use strict';\n${bundleParts.join(';\n')}\n})();`;
try {
  new vm.Script(js, { filename: 'bundle.js' });
} catch (e) {
  // find the offending file for a useful message
  for (const [dir, f] of ordered) {
    try { new vm.Script(`(function(){${read(join(src, dir, f))}\n})`, { filename: `${dir}/${f}` }); } catch (fe) { errors.push(`syntax error in ${dir}/${f}: ${fe.message}`); }
  }
  if (!errors.length) errors.push(`bundle syntax error: ${e.message}`);
}

// 5. Language completeness: every key in en-CA must exist in fr-CA and vice versa
function collectDictionaries() {
  const dicts = { 'en-CA': {}, 'fr-CA': {} };
  const sandbox = { App: { i18n: { register: (ns, by) => { dicts['en-CA'][ns] = by['en-CA']; dicts['fr-CA'][ns] = by['fr-CA']; } } }, console };
  vm.createContext(sandbox);
  for (const f of contentFiles) {
    try { vm.runInContext(read(join(src, 'content', f)), sandbox, { filename: f }); } catch (e) { errors.push(`content/${f} failed to evaluate: ${e.message}`); }
  }
  return dicts;
}
function shapeDiff(a, b, path, out) {
  const ta = Array.isArray(a) ? 'array' : typeof a;
  const tb = Array.isArray(b) ? 'array' : typeof b;
  if (ta !== tb) { out.push(`${path}: en-CA is ${ta}, fr-CA is ${tb}`); return; }
  if (ta === 'array') {
    if (a.length !== b.length) out.push(`${path}: array length ${a.length} vs ${b.length}`);
    a.forEach((v, i) => { if (i < b.length) shapeDiff(v, b[i], `${path}[${i}]`, out); });
  } else if (ta === 'object' && a && b) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a)) out.push(`${path}.${k}: missing in en-CA`);
      else if (!(k in b)) out.push(`${path}.${k}: missing in fr-CA`);
      else shapeDiff(a[k], b[k], `${path}.${k}`, out);
    }
  } else if (ta === 'string') {
    const pa = (a.match(/\{\w+\}/g) || []).sort().join();
    const pb = (b.match(/\{\w+\}/g) || []).sort().join();
    if (pa !== pb) out.push(`${path}: placeholders differ (${pa} vs ${pb})`);
    if (!a.trim() || !b.trim()) out.push(`${path}: empty string`);
  }
}
const dicts = collectDictionaries();
const langDiff = [];
shapeDiff(dicts['en-CA'], dicts['fr-CA'], 'content', langDiff);
if (langDiff.length) errors.push(`language completeness:\n   ${langDiff.join('\n   ')}`);
else log(`✓ language dictionaries complete (${Object.keys(dicts['en-CA']).length} namespaces, en-CA = fr-CA shape)`);

// 5b. Canadian French spacing (warning only): a space before « : » or inside « » must be
// non-breaking (U+00A0) so a line wrap never strands the sign; ; ? ! take no space at all.
const frSpacing = [];
(function walkFr(v, path) {
  if (typeof v === 'string') {
    const m = v.match(/.{0,12}(?: [:;?!»]|« ).{0,12}/g);
    if (m) frSpacing.push(`${path}: ${m.map((x) => JSON.stringify(x)).join(', ')}`);
  } else if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) walkFr(v[k], Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`);
  }
}(dicts['fr-CA'], 'fr-CA'));
if (frSpacing.length) console.warn(`! fr-CA spacing: ordinary space (U+0020) before : ; ? ! » or after « in ${frSpacing.length} string(s); use U+00A0 (none before ; ? !):\n   ${frSpacing.join('\n   ')}`);

// 6. Runtime isolation and privacy lint on the application code
const forbidden = [
  [/api\.elevenlabs\.io|elevenlabs\.io\/v1|xi-api-key/i, 'ElevenLabs endpoint or key header'],
  [/speechSynthesis|SpeechSynthesisUtterance/, 'browser speech synthesis'],
  [/\beval\s*\(|new\s+Function\s*\(/, 'eval / new Function'],
  [/XMLHttpRequest|\bfetch\s*\(|WebSocket|EventSource|sendBeacon/, 'network API in application code'],
  [/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=|document\.write/, 'raw HTML injection'],
  [/sessionStorage/, 'sessionStorage (use in-memory session state)'],
  [/https?:\/\/(?!www\.bdc\.ca\/|www\.w3\.org\/2000\/svg)[a-z0-9.-]+\.[a-z]{2,}/i, 'unexpected absolute URL in application code'],
];
for (const [re, what] of forbidden) {
  const m = js.match(re);
  if (m) errors.push(`forbidden pattern (${what}): "${m[0]}"`);
}
if (/ELEVENLABS_API_KEY/.test(js)) errors.push('API key variable name present in bundle');

// 7. Assemble
const logo = readFileSync(join(src, 'assets/bdc-logo.webp')).toString('base64');
let gitSha = '';
try { gitSha = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { gitSha = 'uncommitted'; }
const build = { version: '1.0.0', builtAt: new Date().toISOString(), source: gitSha, silentAudio, modules: onlyModules || 'all' };
const data = [
  `<script type="application/json" id="data-record">${safeJSON(record)}</script>`,
  `<script type="application/json" id="data-cues">${safeJSON(cues)}</script>`,
  `<script type="application/json" id="data-assets">${safeJSON({ logo: `data:image/webp;base64,${logo}` })}</script>`,
  `<script type="application/json" id="data-build">${safeJSON(build)}</script>`,
  ...audioTags,
].join('\n');

const template = read(join(src, 'index.template.html'));
const html = template.split('/*@styles*/').join(css).split('/*@scripts*/').join(js).split('<!--@data-->').join(data);

const widgetCount = html.split('https://accessibilityserver.org/widget.js').length - 1;
if (widgetCount !== 1) errors.push(`accessibility widget script must appear exactly once (found ${widgetCount})`);
if (/<script[^>]+src=/i.test(html)) errors.push('external <script src> tag found');
if (/<link[^>]+href=["']https?:/i.test(html)) errors.push('remote stylesheet/font link found');
if (/@import|url\(\s*["']?https?:/i.test(css)) errors.push('remote CSS resource found');

if (errors.length) {
  console.error(`\nBuild failed:\n - ${errors.join('\n - ')}`);
  process.exit(1);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
const size = statSync(outPath).size;
log(`✓ wrote ${outPath} (${(size / 1024 / 1024).toFixed(2)} MB; ${cssFiles.length} css, ${ordered.length} js${silentAudio ? ', NO AUDIO' : ''}${onlyModules ? `; modules: ${onlyModules.join(',')}` : ''})`);
if (size > 10 * 1024 * 1024) console.warn('! file exceeds the 10 MB design target');
warnings.forEach((w) => console.warn(`! ${w}`));
