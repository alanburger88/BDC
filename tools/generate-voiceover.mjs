#!/usr/bin/env node
// CREATION-TIME ONLY. Synthesises the frozen English and Canadian French
// narration with ElevenLabs text-to-speech (with timestamps), saves the audio
// masters and alignment, and builds the language-specific chapter/caption cue
// manifests that the SPA embeds. The delivered index.html never calls this
// service and contains no key, SDK or synthesis fallback.
//
// Usage:
//   ELEVENLABS_API_KEY=... node tools/generate-voiceover.mjs [--locale en-CA|fr-CA] [--auditions] [--cues-only]
// Behind an authenticating egress proxy (no key in the environment), run with
// NODE_USE_ENV_PROXY=1 so Node's fetch honours HTTPS_PROXY.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const narrationPath = join(root, 'src/content/narration.json');
const audioDir = join(root, 'src/assets/audio');
const auditionDir = join(root, 'docs/audio-auditions');
const narration = JSON.parse(readFileSync(narrationPath, 'utf8'));

const args = process.argv.slice(2);
const only = args.includes('--locale') ? args[args.indexOf('--locale') + 1] : null;
const cuesOnly = args.includes('--cues-only');
const auditions = args.includes('--auditions');

export function scriptText(locale) {
  return narration.scripts[locale].join('\n\n');
}

export function scriptHash(locale) {
  const n = narration;
  return createHash('sha256')
    .update(JSON.stringify({ text: scriptText(locale), voice: n.voices[locale].voiceId, model: n.model, settings: n.voiceSettings, format: n.outputFormat }))
    .digest('hex');
}

async function synthesise(voiceId, text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=${narration.outputFormat}`;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.ELEVENLABS_API_KEY) headers['xi-api-key'] = process.env.ELEVENLABS_API_KEY;
  else console.warn('  ELEVENLABS_API_KEY not set - relying on an authenticating build proxy.');
  const body = { text, model_id: narration.model, voice_settings: narration.voiceSettings };
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.ok) return res.json();
    const detail = await res.text();
    if (res.status >= 500 || res.status === 429) {
      console.warn(`  attempt ${attempt} failed (${res.status}); retrying`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 400)}`);
  }
  throw new Error('ElevenLabs: retries exhausted');
}

function probeDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString().trim();
  return Number(out);
}

const round = (n) => Math.round(n * 1000) / 1000;

// Split one paragraph into caption-sized pieces at sentence ends, then at
// commas / conjunctions when a sentence is long. Returns [startIdx, endIdx) ranges.
function captionRanges(text, offset) {
  const ranges = [];
  const sentenceRe = /[^.!?]+[.!?]+["”’]?\s*/g;
  let m;
  const sentences = [];
  while ((m = sentenceRe.exec(text))) sentences.push([m.index, m.index + m[0].length]);
  if (!sentences.length) sentences.push([0, text.length]);
  for (const [s, e] of sentences) {
    let start = s;
    const seg = () => text.slice(start, e);
    while (e - start > 84) {
      const piece = seg();
      // choose a split near the middle at ", " or " and " / " et "
      const candidates = [];
      const re = /,\s|\s(and|et|or|ou)\s/g;
      let c;
      while ((c = re.exec(piece))) {
        // never split inside a spoken amount ("nine hundred and twenty")
        if (!c[0].startsWith(',') && /(hundred|thousand|cents?|mille)$/i.test(piece.slice(0, c.index))) continue;
        candidates.push(c.index + (c[0].startsWith(',') ? 1 : 0));
      }
      const mid = piece.length / 2;
      const best = candidates.filter((i) => i > 24 && piece.length - i > 18).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
      if (best === undefined) break;
      ranges.push([offset + start, offset + start + best]);
      start = start + best;
      while (text[start] === ' ') start++;
    }
    ranges.push([offset + start, offset + e]);
  }
  return ranges;
}

export function buildCues(locale, alignment, duration) {
  const text = scriptText(locale);
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  if (chars.join('') !== text) throw new Error(`${locale}: alignment characters do not match the script text`);

  const firstNonSpace = (a, b) => { for (let i = a; i < b; i++) if (chars[i].trim()) return i; return a; };
  const lastNonSpace = (a, b) => { for (let i = b - 1; i >= a; i--) if (chars[i].trim()) return i; return b - 1; };

  // paragraphs -> chapters
  const paras = narration.scripts[locale];
  let offset = 0;
  const chapterRanges = paras.map((p) => { const r = [offset, offset + p.length]; offset += p.length + 2; return r; });
  const chapters = chapterRanges.map(([a, b], i) => ({
    id: narration.chapters[i],
    index: i,
    start: i === 0 ? 0 : round(Math.max(0, starts[firstNonSpace(a, b)] - 0.12)),
    speechStart: round(starts[firstNonSpace(a, b)]),
    speechEnd: round(ends[lastNonSpace(a, b)]),
    text: paras[i],
  }));
  chapters.forEach((c, i) => { c.end = i < chapters.length - 1 ? chapters[i + 1].start : round(duration); });

  // captions
  const captions = [];
  chapterRanges.forEach(([a, b], ci) => {
    for (const [s, e] of captionRanges(text.slice(a, b), a)) {
      const fs = firstNonSpace(s, e);
      const ls = lastNonSpace(s, e);
      captions.push({ chapter: narration.chapters[ci], start: round(starts[fs]), end: round(ends[ls]), text: text.slice(fs, ls + 1) });
    }
  });
  // hold each caption until the next one starts when the gap is short
  captions.forEach((c, i) => {
    const next = captions[i + 1];
    if (next && next.start - c.end < 0.8) c.end = next.start;
    else c.end = round(Math.min(c.end + 0.6, duration));
  });

  // semantic marks (phrase start times) used to pace scene animation
  const marks = {};
  for (const [id, phrase] of Object.entries(narration.marks[locale] || {})) {
    const idx = text.indexOf(phrase);
    if (idx < 0) throw new Error(`${locale}: mark phrase not found: ${phrase}`);
    marks[id] = round(starts[firstNonSpace(idx, idx + phrase.length)]);
  }

  return {
    locale,
    duration: round(duration),
    scriptHash: scriptHash(locale),
    voice: narration.voices[locale],
    model: narration.model,
    generatedAt: new Date().toISOString(),
    chapters,
    captions,
    marks,
  };
}

async function runLocale(locale) {
  const voice = narration.voices[locale];
  const mp3 = join(audioDir, `narration-${locale}.mp3`);
  const alignFile = join(audioDir, `narration-${locale}.alignment.json`);
  if (!cuesOnly) {
    console.log(`Synthesising ${locale} with voice ${voice.voiceName} (${voice.voiceId}), model ${narration.model}`);
    const res = await synthesise(voice.voiceId, scriptText(locale));
    writeFileSync(mp3, Buffer.from(res.audio_base64, 'base64'));
    writeFileSync(alignFile, JSON.stringify({ scriptHash: scriptHash(locale), alignment: res.alignment, normalized_alignment: res.normalized_alignment }, null, 1));
  }
  if (!existsSync(mp3)) throw new Error(`${mp3} missing; run without --cues-only first`);
  const saved = JSON.parse(readFileSync(alignFile, 'utf8'));
  if (saved.scriptHash !== scriptHash(locale)) throw new Error(`${locale}: saved alignment is stale for the current script; re-synthesise`);
  const duration = probeDuration(mp3);
  const cues = buildCues(locale, saved.alignment, duration);
  writeFileSync(join(audioDir, `cues-${locale}.json`), JSON.stringify(cues, null, 1));
  console.log(`  ${locale}: ${duration.toFixed(2)} s, ${cues.chapters.length} chapters, ${cues.captions.length} captions`);
}

async function runAuditions() {
  mkdirSync(auditionDir, { recursive: true });
  for (const [locale, spec] of Object.entries(narration.auditions || {})) {
    for (const v of spec.voices) {
      console.log(`Audition ${locale} ${v.voiceName}`);
      const res = await synthesise(v.voiceId, spec.text);
      writeFileSync(join(auditionDir, `${locale}-${v.voiceName.toLowerCase()}.mp3`), Buffer.from(res.audio_base64, 'base64'));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(audioDir, { recursive: true });
  try {
    if (auditions) await runAuditions();
    else for (const locale of Object.keys(narration.scripts)) if (!only || only === locale) await runLocale(locale);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
