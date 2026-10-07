#!/usr/bin/env node
/* Builds walkthrough/dist, the static site deployed to Netlify.
 *
 *   node walkthrough/tools/build.mjs [--out DIR]
 *
 * - validates the walkthrough content against the extracted deck (the talk track
 *   must use every speaker-note sentence once, in order, unchanged);
 * - copies the page, styles, scripts and assets;
 * - writes js/content.js (window.WT_CONTENT) from the content files;
 * - copies the Financing Change Notice (../dist/index.html, unchanged) to notice/;
 * - writes Netlify _headers and robots.txt;
 * - lints the sources for CSP and isolation rules.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > -1 ? resolve(process.argv[outArg + 1]) : join(ROOT, 'dist');
const NOTICE = resolve(ROOT, '..', 'dist', 'index.html');

const errors = [];
const fail = (msg) => errors.push(msg);

/* ---------- content ---------- */
const deck = JSON.parse(readFileSync(join(SRC, 'content', 'deck.json'), 'utf8'));
const wt = JSON.parse(readFileSync(join(SRC, 'content', 'walkthrough.json'), 'utf8'));

// Sentence split used for the talk track. Abbreviations in the notes ("Inc.,",
// "Acorn.Insight") are never followed by a space and a capital, so they stay whole.
const sentences = (s) => s.trim().split(/(?<=[.!?])\s+(?=[A-Z“"])/);

if (deck.slides.length !== wt.slides.length) fail(`deck has ${deck.slides.length} slides, content has ${wt.slides.length}`);
const stopIds = new Set(wt.live.stops.map((s) => s.id));
if (stopIds.size !== wt.live.stops.length) fail('duplicate live stop ids');

const GROUPS = ['notice', 'why', 'keep'];
const slides = wt.slides.map((s, i) => {
  const n = i + 1;
  if (s.n !== n) fail(`slide ${n}: n is ${s.n}`);
  for (const key of ['title', 'alt', 'chapter']) if (!s[key]) fail(`slide ${n}: missing ${key}`);
  if (!wt.chapters[s.chapter]) fail(`slide ${n}: unknown chapter ${s.chapter}`);
  if (!Array.isArray(s.text) || !s.text.length) fail(`slide ${n}: missing slide text`);
  if (s.live && !stopIds.has(s.live)) fail(`slide ${n}: unknown live stop ${s.live}`);
  const notes = (deck.slides[i] || {}).notes || '';
  const parts = sentences(notes);
  const used = GROUPS.flatMap((g) => (s.talk && s.talk[g]) || []);
  const expected = parts.map((_, k) => k);
  if (JSON.stringify(used) !== JSON.stringify(expected)) fail(`slide ${n}: talk groups ${JSON.stringify(used)} must cover sentences ${JSON.stringify(expected)} in order`);
  const talk = {};
  for (const g of GROUPS) if (s.talk && s.talk[g] && s.talk[g].length) talk[g] = s.talk[g].map((k) => parts[k]).join(' ');
  // The rebuilt talk track must equal the speaker notes exactly (whitespace-normalised)
  const rebuilt = GROUPS.map((g) => talk[g]).filter(Boolean).join(' ');
  if (rebuilt !== notes.replace(/\s+/g, ' ').trim()) fail(`slide ${n}: talk track differs from the speaker notes`);
  for (const suffix of ['', '-800', '-thumb']) {
    const f = join(SRC, 'assets', 'slides', `slide-${String(n).padStart(2, '0')}${suffix}.webp`);
    if (!existsSync(f)) fail(`missing ${relative(ROOT, f)}`);
  }
  return { n, chapter: s.chapter, title: s.title, alt: s.alt, text: s.text, talk, live: s.live || null };
});

for (const stop of wt.live.stops) {
  if (!stop.title || !stop.body) fail(`stop ${stop.id}: missing title or body`);
  if (!stop.close && !stop.try) fail(`stop ${stop.id}: missing "try"`);
  if (stop.slide && !(stop.slide >= 1 && stop.slide <= slides.length)) fail(`stop ${stop.id}: slide ${stop.slide} out of range`);
  for (const r of stop.recap || []) if (!stopIds.has(r.stop)) fail(`stop ${stop.id}: recap links to unknown stop ${r.stop}`);
}
for (const d of Object.keys(wt.devices)) {
  const f = join(SRC, 'assets', 'previews', `notice-${d}.webp`);
  if (!existsSync(f)) fail(`missing ${relative(ROOT, f)} (run node walkthrough/tools/previews.mjs)`);
}

const content = {
  meta: wt.meta,
  welcome: wt.welcome,
  how: wt.how,
  talkLabels: wt.talkLabels,
  chapters: wt.chapters,
  ratio: deck.ratio,
  slides,
  live: wt.live,
  devices: wt.devices,
};

/* ---------- lint ---------- */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const codeFiles = walk(SRC).filter((f) => ['.js', '.css', '.html'].includes(extname(f)));
const BANNED_JS = [
  [/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML/, 'HTML string injection'],
  [/\beval\s*\(|new\s+Function\s*\(|document\.write/, 'dynamic code'],
  [/setAttribute\(\s*['"]style['"]|\.cssText\b/, 'inline style attribute (blocked by the CSP)'],
  [/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/, 'network call'],
  [/localStorage\.(?!getItem|setItem|removeItem)/, 'unexpected storage API'],
];
for (const f of codeFiles) {
  const text = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);
  const urls = text.match(/https?:\/\/[^\s"'`)<>]+/g) || [];
  const allowed = /^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink)$/;
  for (const u of urls) if (!allowed.test(u)) fail(`${rel}: external URL ${u}`);
  if (extname(f) === '.js') {
    for (const [re, why] of BANNED_JS) if (re.test(text)) fail(`${rel}: ${why}`);
  }
  if (extname(f) === '.html') {
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) fail(`${rel}: inline <script>`);
    if (/\sstyle\s*=/i.test(text)) fail(`${rel}: style attribute`);
    if (/\son[a-z]+\s*=/i.test(text)) fail(`${rel}: inline event handler`);
  }
}

if (!existsSync(NOTICE)) fail(`notice not built: ${NOTICE} (run node tools/build.mjs at the repository root)`);

if (errors.length) {
  console.error(`Build failed:\n - ${errors.join('\n - ')}`);
  process.exit(1);
}

/* ---------- write ---------- */
// Only ever replace a folder this build created (it holds a marker file), or a new one.
const MARKER = '.wt-build';
const REPO = resolve(ROOT, '..');
if ([ROOT, SRC, REPO, resolve(ROOT, 'tools'), resolve(ROOT, 'tests')].includes(OUT) || SRC.startsWith(`${OUT}/`)) {
  console.error(`Refusing to build into ${OUT}`);
  process.exit(1);
}
if (existsSync(OUT) && readdirSync(OUT).length && !existsSync(join(OUT, MARKER))) {
  console.error(`Refusing to replace ${OUT}: it is not empty and was not created by this build`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, MARKER), 'Created by walkthrough/tools/build.mjs; replaced on every build.\n');
for (const dir of ['css', 'js', 'assets']) cpSync(join(SRC, dir), join(OUT, dir), { recursive: true });
cpSync(join(SRC, 'index.html'), join(OUT, 'index.html'));

const noticeHtml = readFileSync(NOTICE);
const noticeSha = createHash('sha256').update(noticeHtml).digest('hex');
mkdirSync(join(OUT, 'notice'), { recursive: true });
writeFileSync(join(OUT, 'notice', 'index.html'), noticeHtml);

const srcHash = createHash('sha256');
for (const f of walk(SRC).sort()) srcHash.update(relative(SRC, f)).update(readFileSync(f));
content.build = { notice: noticeSha.slice(0, 12), source: srcHash.digest('hex').slice(0, 16), slides: slides.length, stops: wt.live.stops.length };
writeFileSync(join(OUT, 'js', 'content.js'), `/* Generated by walkthrough/tools/build.mjs from src/content. Do not edit. */\nwindow.WT_CONTENT = ${JSON.stringify(content)};\n`);

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self'", "font-src 'self'",
  "connect-src 'self'", "frame-src 'self'", "media-src 'none'", "object-src 'none'", "base-uri 'none'",
  "form-action 'none'", "frame-ancestors 'self'",
].join('; ');
writeFileSync(join(OUT, '_headers'), [
  '/*',
  '  X-Robots-Tag: noindex, nofollow, noarchive',
  '  Referrer-Policy: no-referrer',
  '  X-Content-Type-Options: nosniff',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  '/',
  `  Content-Security-Policy: ${CSP}`,
  '/index.html',
  `  Content-Security-Policy: ${CSP}`,
  '/notice/*',
  '  X-Frame-Options: SAMEORIGIN',
  "  Content-Security-Policy: frame-ancestors 'self'",
  '',
].join('\n'));
writeFileSync(join(OUT, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

// Files copied from uploads can carry owner-only permissions; make everything readable.
let bytes = 0;
const files = walk(OUT);
for (const f of files) { chmodSync(f, 0o644); bytes += statSync(f).size; }

console.log(`walkthrough built: ${files.length} files, ${(bytes / 1048576).toFixed(2)} MB -> ${relative(process.cwd(), OUT) || '.'}`);
console.log(`  ${slides.length} slides, ${wt.live.stops.length} live stops, notice sha256 ${noticeSha.slice(0, 12)}`);
