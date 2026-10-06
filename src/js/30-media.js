/* Personalised animated explanation (PRD section 8).
 * A video-like player: HTML/SVG/CSS scenes synchronised to the narration
 * that was synthesised at creation time and embedded in this file as base64.
 *
 * - audio.currentTime is the only clock. Chapters, scene beats and captions
 *   are derived from it; requestAnimationFrame runs only while playing and
 *   only renders the state for the current audio time.
 * - Audio is decoded lazily (first Play / poster click / chapter selection)
 *   into a local Blob URL. Nothing here makes a network request or uses
 *   speech synthesis; if the audio is missing or fails, an inline message is
 *   shown and the transcript stays usable.
 * - One singleton player: App.media.mount(container) can be called on every
 *   overview render (including language changes) and re-attaches the same
 *   state held in App.session.slice('media'). */
App.media = (() => {
  const CUES = App.readEmbeddedJSON('data-cues') || {};
  const RATES = [0.75, 1, 1.25, 1.5];
  const SKIP = 5;          // seconds moved by the arrow keys
  const BEAT = 0.45;       // narration seconds over which a reveal completes
  const CAPTION_LEAD = 0.1;
  const R = App.record || {};
  const D = R.derived || {};
  const prefs = App.util.prefs;

  /* ---------- ExperienceState (memory only, per tab) ---------- */
  function initState() {
    const cap = prefs.get('captions');
    const rate = Number(prefs.get('rate'));
    const vol = prefs.get('volume');
    return {
      locale: App.i18n.locale,
      time: 0,
      chapter: 'welcome',
      playing: false,
      captions: cap === undefined ? true : cap !== false,
      rate: RATES.includes(rate) ? rate : 1,
      volume: typeof vol === 'number' && Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 1,
      muted: prefs.get('muted') === true,
      transcriptOpen: false,
      chaptersOpen: false,
      moreOpen: false, // narrow frames: secondary controls row shown
      engaged: false, // poster dismissed
      ended: false,
      errors: {}, // per locale
    };
  }
  const S = () => App.session.slice('media', initState);
  const savePref = (k, v) => { try { prefs.set(k, v); } catch (e) { /* preference not stored */ } };

  /* ---------- Cue helpers ---------- */
  const cuesFor = (l) => CUES[l] || null;
  const cues = () => cuesFor(S().locale);
  const duration = () => (cues() ? cues().duration : 0);
  const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
  const capsCache = {};

  function chapterCaptions(locale, id) {
    const key = `${locale}|${id}`;
    if (!capsCache[key]) {
      const c = cuesFor(locale);
      capsCache[key] = c ? c.captions.filter((cap) => cap.chapter === id) : [];
    }
    return capsCache[key];
  }

  function chapterAt(tm, locale) {
    const c = cuesFor(locale || S().locale);
    if (!c || !c.chapters.length) return null;
    const list = c.chapters;
    for (let i = list.length - 1; i >= 0; i -= 1) if (tm + 0.002 >= list[i].start) return list[i];
    return list[0];
  }

  // The caption for a time, restricted to the current chapter so that a
  // chapter start always shows that chapter's first line.
  function captionAt(tm, chapter) {
    const caps = chapterCaptions(S().locale, chapter.id);
    let cur = caps[0] || null;
    for (const cap of caps) if (tm + CAPTION_LEAD >= cap.start) cur = cap;
    return cur;
  }

  /* Captions: at most two lines. A caption that would wrap to more lines is
   * split into the fewest chunks that each fit two lines at the measured
   * caption width (canvas text metrics, same font as the caption bar).
   * Break points prefer natural pauses and never fall inside a spoken amount
   * or date ("one thousand six | hundred", "trente et | un janvier") or right
   * after a short function word. Each chunk is timed by its share of the
   * caption's interval, so it still follows the audio clock. */
  const NUMERIC = new Set(('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen '
    + 'twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million first second third fourth fifth sixth seventh eighth ninth '
    + 'twentieth thirtieth january february march april may june july august september october november december dollar dollars and '
    + 'un une deux trois quatre cinq sept huit neuf dix onze douze treize quatorze quinze seize vingt vingts trente quarante cinquante soixante '
    + 'cent cents mille premier janvier février mars avril mai juin juillet août septembre octobre novembre décembre et').split(' '));
  const GLUE = new Set(('a an the of to for in on at by with and or your our is are be will from that this these its '
    + 'le la les un une des du de au aux à et ou en pour par sur dans vos votre ce cette ces est sont se ne').split(' '));
  const bare = (w) => String(w || '').toLowerCase().replace(/^[«“"(]+|[»”"),.;:!?]+$/g, '');
  const isNumeric = (w) => { const b = bare(w); return !!b && b.split(/[-–]/).every((p) => NUMERIC.has(p)); };

  function breakCost(a, b) {
    const punct = /[,;:.!?]$/.test(a);
    if (isNumeric(a) && isNumeric(b)) return punct ? 25 : 90;
    if (punct) return -30;
    if (GLUE.has(bare(a))) return 45;
    if (GLUE.has(bare(b))) return -8;
    return 0;
  }

  let measureCtx = null;
  function textMeasurer(font) {
    if (measureCtx === null) {
      try { measureCtx = h('canvas').getContext('2d') || false; } catch (e) { measureCtx = false; }
    }
    if (!measureCtx) return null;
    measureCtx.font = font;
    return (s) => measureCtx.measureText(s).width;
  }

  function splitCaption(text, metrics) {
    const words = text.split(/\s+/).filter(Boolean);
    const n = words.length;
    const measure = (metrics && textMeasurer(metrics.font)) || ((s) => s.length * (metrics ? metrics.fontSize : 16) * 0.56);
    const lineW = metrics ? metrics.lineWidth * 0.95 : 600;
    const ww = words.map((w) => measure(w));
    const sp = measure(' ');
    // Greedy wrap of words [i, j): does it fit in two lines?
    const fits = (i, j) => {
      let lines = 1;
      let cur = 0;
      for (let k = i; k < j; k += 1) {
        const add = cur ? sp + ww[k] : ww[k];
        if (cur && cur + add > lineW) { lines += 1; cur = ww[k]; } else cur += add;
        if (lines > 2) return false;
      }
      return true;
    };
    if (n <= 1 || fits(0, n)) return [text];
    const len = (i, j) => words.slice(i, j).join(' ').length;
    // Best split into exactly k chunks: { cost, parts } or null
    const solve = (k) => {
      const avg = text.length / k;
      // dp[c][j]: best cost to cover words [0, j) with c chunks
      const dp = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(Infinity));
      const from = Array.from({ length: k + 1 }, () => new Array(n + 1).fill(-1));
      dp[0][0] = 0;
      for (let c = 1; c <= k; c += 1) {
        for (let j = c; j <= n; j += 1) {
          for (let i = c - 1; i < j; i += 1) {
            if (dp[c - 1][i] === Infinity || !fits(i, j)) continue;
            const balance = ((len(i, j) / avg) - 1) ** 2 * 40;
            const brk = j < n ? breakCost(words[j - 1], words[j]) : 0;
            const v = dp[c - 1][i] + balance + brk;
            if (v < dp[c][j]) { dp[c][j] = v; from[c][j] = i; }
          }
        }
      }
      if (dp[k][n] === Infinity) return null;
      const parts = [];
      let j = n;
      for (let c = k; c >= 1; c -= 1) { const i = from[c][j]; parts.unshift(words.slice(i, j).join(' ')); j = i; }
      return { cost: dp[k][n] + (k - 1) * 45, parts };
    };
    // The fewest chunks that fit - or one more when that avoids a bad break
    // (for example splitting a spoken amount on a narrow phone).
    for (let k = 2; k <= n; k += 1) {
      const best = solve(k);
      if (!best) continue;
      const alt = k < n ? solve(k + 1) : null;
      return (alt && alt.cost < best.cost ? alt : best).parts;
    }
    return [text];
  }

  const chunkCache = new Map();
  function chunksFor(cap, metrics) {
    const key = `${cap.start}|${cap.text}|${metrics ? `${Math.round(metrics.lineWidth)}|${metrics.font}` : '-'}`;
    if (chunkCache.has(key)) return chunkCache.get(key);
    const parts = splitCaption(cap.text, metrics);
    const total = parts.reduce((a, s) => a + s.length, 0) || 1;
    let acc = 0;
    const span = cap.end - cap.start;
    const out = parts.map((text) => {
      const start = cap.start + span * (acc / total);
      acc += text.length;
      return { text, start };
    });
    chunkCache.set(key, out);
    return out;
  }

  function chunkAt(cap, tm, metrics) {
    const list = chunksFor(cap, metrics);
    let cur = list[0];
    for (const c of list) if (tm + CAPTION_LEAD >= c.start) cur = c;
    return cur ? cur.text : '';
  }

  /* ---------- Embedded audio (lazy, local only) ---------- */
  let audio = null;
  let audioLocale = null;
  const urls = {};
  let raf = 0;
  let ui = null;
  let resizeObs = null;

  /* ---------- Watch tracking (session events only) ----------
   * Only narration that actually plays counts: the audio clock's forward
   * progress between two renders while playing. A seek (setTime) breaks the
   * chain, so chapters crossed or skipped by seeking never count, and
   * jumping to the end is not a completed viewing.
   * - video_chapter_viewed: once a chapter has played for CHAPTER_VIEW s.
   * - video_completed: playback reached the end on its own AND at least
   *   COMPLETE_SHARE of the narration (distinct positions) has been played. */
  const CHAPTER_VIEW = 1;
  const COMPLETE_SHARE = 0.8;
  const COVER_STEP = 0.1;  // coverage resolution, seconds of narration
  const MAX_TICK = 3;      // larger forward jumps are never counted as played
  let watch = {};          // per locale: { cover: Set, chapters: {id: s}, playedTo }
  let viewed = new Set();  // `${locale}:${chapter}` already logged
  let lastTick = null;     // { locale, tm } previous position while playing

  function watchFor(locale) {
    if (!watch[locale]) watch[locale] = { cover: new Set(), chapters: {}, playedTo: -1 };
    return watch[locale];
  }

  // Credits the narration played since the previous tick (if it was played,
  // not jumped to) and remembers this position for the next tick.
  function trackPlayback(locale, tm, chapterId) {
    if (lastTick && lastTick.locale === locale) {
      const d = tm - lastTick.tm;
      if (d > 0 && d <= MAX_TICK) {
        const w = watchFor(locale);
        for (let i = Math.ceil(lastTick.tm / COVER_STEP - 1e-6); i * COVER_STEP < tm; i += 1) w.cover.add(i);
        if (chapterId) w.chapters[chapterId] = (w.chapters[chapterId] || 0) + d;
        w.playedTo = tm;
      }
    }
    lastTick = { locale, tm };
  }

  function resetWatch() {
    watch = {};
    viewed = new Set();
    lastTick = null;
  }

  function decode(locale) {
    if (urls[locale] !== undefined) return urls[locale];
    const el = document.getElementById(`audio-${locale}`);
    let url = null;
    if (el && el.textContent && el.textContent.trim()) {
      try {
        const bin = atob(el.textContent.replace(/\s+/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        url = URL.createObjectURL(new Blob([bytes], { type: el.getAttribute('data-mime') || 'audio/mpeg' }));
      } catch (e) {
        url = null;
      }
    }
    urls[locale] = url;
    return url;
  }

  const audioActive = () => !!(audio && audioLocale === S().locale);
  const audioReady = () => audioActive() && audio.readyState >= 1;
  const isPlaying = () => audioActive() && !audio.paused && !audio.ended;

  function applyAudioSettings() {
    if (!audio) return;
    const st = S();
    audio.defaultPlaybackRate = st.rate;
    audio.playbackRate = st.rate;
    audio.volume = st.volume;
    audio.muted = st.muted;
  }

  function bindAudio(a) {
    a.addEventListener('play', onPlay);
    a.addEventListener('playing', () => { startLoop(); render(); });
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    a.addEventListener('loadedmetadata', onMeta);
    ['seeking', 'seeked', 'timeupdate', 'ratechange', 'volumechange'].forEach((type) => a.addEventListener(type, () => render()));
    a.addEventListener('error', () => { if (a.error && a === audio) fail(audioLocale); });
  }

  // Prepares the current locale's track. Returns false (and shows the inline
  // error) when the embedded audio is missing or cannot be decoded.
  function ensureAudio() {
    const st = S();
    if (audioActive()) return true;
    const url = decode(st.locale);
    if (!url) { fail(st.locale); return false; }
    if (!audio) {
      audio = document.createElement('audio');
      audio.preload = 'auto';
      bindAudio(audio);
    }
    audioLocale = st.locale;
    audio.src = url;
    applyAudioSettings();
    try { audio.currentTime = st.time; } catch (e) { /* applied on loadedmetadata */ }
    return true;
  }

  // The playback clock: audio.currentTime once the track is loaded; before
  // that (or without audio) the stored position.
  function now() {
    const st = S();
    if (audioReady()) return Math.max(0, Math.min(audio.currentTime, duration()));
    return st.time;
  }

  function onMeta() {
    if (!audioActive()) return;
    const st = S();
    applyAudioSettings();
    if (Math.abs(audio.currentTime - st.time) > 0.02) {
      try { audio.currentTime = st.time; } catch (e) { /* ignore */ }
    }
    render(true);
  }

  function onPlay() {
    if (!audioActive()) return;
    const st = S();
    st.playing = true;
    st.ended = false;
    st.engaged = true;
    App.events.log('video_started', { id: st.locale });
    startLoop();
    render();
  }

  function onPause() {
    const st = S();
    if (audioActive()) st.time = now();
    st.playing = false;
    stopLoop();
    render();
  }

  function onEnded() {
    if (!audioActive()) return;
    const st = S();
    const dur = duration();
    // Credit the last stretch before the end (only if it was played, not jumped over)
    trackPlayback(st.locale, dur, (chapterAt(dur) || {}).id);
    lastTick = null;
    st.playing = false;
    st.ended = true;
    st.time = dur;
    stopLoop();
    const w = watchFor(st.locale);
    const reachedByPlayback = w.playedTo >= dur - 0.5;
    if (reachedByPlayback && w.cover.size * COVER_STEP >= COMPLETE_SHARE * dur) App.events.log('video_completed', { id: st.locale });
    render();
    App.announce(t('media.endedAnnounce'));
  }

  function frame() {
    raf = 0;
    render();
    if (isPlaying()) raf = requestAnimationFrame(frame);
  }
  function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  function fail(locale) {
    const st = S();
    const l = locale || st.locale;
    st.errors[l] = true;
    st.playing = false;
    st.engaged = true;
    stopLoop();
    if (l === st.locale) {
      st.transcriptOpen = true;
      App.announce(t('media.error'), true);
    }
    render(true);
  }

  /* ---------- Commands ---------- */
  function setTime(tm) {
    const st = S();
    const v = Math.max(0, Math.min(duration(), Number(tm) || 0));
    st.time = v;
    lastTick = null; // a jump, not playback
    if (audioActive()) {
      try { audio.currentTime = v; } catch (e) { /* applied on loadedmetadata */ }
    }
  }

  function play() {
    const st = S();
    st.engaged = true;
    if (!cues()) return;
    if (!ensureAudio()) { render(true); return; }
    if (st.ended || now() >= duration() - 0.05) setTime(0);
    st.ended = false;
    let p;
    try { p = audio.play(); } catch (e) { fail(st.locale); return; }
    if (p && typeof p.catch === 'function') {
      p.catch((e) => {
        if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) { render(); return; }
        fail(st.locale);
      });
    }
    render(true);
  }

  function pause() {
    if (audio && !audio.paused) audio.pause();
    S().playing = false;
    stopLoop();
    render();
  }

  function toggle() {
    if (isPlaying()) pause(); else play();
  }

  function seek(tm, opts = {}) {
    const st = S();
    st.engaged = true;
    st.ended = false;
    setTime(tm);
    if (opts.play) play(); else render(true);
  }

  function seekChapter(id, opts) {
    const c = cues();
    const ch = c && c.chapters.find((x) => x.id === id);
    if (ch) seek(ch.start, opts);
  }

  // Language switch: pause, select the other embedded track and move to the
  // START of the same semantic chapter in that locale (never reuse the
  // other language's timestamp). Stays paused.
  function syncLocale() {
    const st = S();
    const next = App.i18n.locale;
    if (st.locale === next) return false;
    const prevChapter = chapterAt(now(), st.locale);
    if (audio && !audio.paused) audio.pause();
    stopLoop();
    const nc = cuesFor(next);
    const target = nc && prevChapter ? nc.chapters.find((c) => c.id === prevChapter.id) : null;
    const used = !!audio;
    st.locale = next;
    st.playing = false;
    st.ended = false;
    st.time = target ? target.start : 0;
    st.chapter = target ? target.id : 'welcome';
    lastTick = null;
    // The person has already used the player: prepare this track now
    // (decoded lazily, once per locale) so it is ready at the mapped chapter.
    if (used && !st.errors[next]) ensureAudio();
    return true;
  }

  function toggleFullscreen() {
    if (!ui) return;
    try {
      if (document.fullscreenElement) {
        const p = document.exitFullscreen();
        if (p && p.catch) p.catch(() => {});
      } else {
        const p = ui.fs.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* fallback: the normal view */ }
  }
  const fullscreenSupported = () => !!(document.fullscreenEnabled && Element.prototype.requestFullscreen);

  /* ---------- Formatting shortcuts ---------- */
  const money = (cents, opts) => App.fmt.money(cents, { compact: true, ...(opts || {}) });
  const fmtDate = (iso, style) => App.fmt.date(iso, style);
  // Canadian French writes the first day of a month as an ordinal: « le 1er novembre 2026 »
  const longDate = (iso) => {
    const s = App.fmt.date(iso, 'long');
    return App.i18n.locale === 'fr-CA' && Number(String(iso).slice(8, 10)) === 1 ? s.replace(/^1(?=\s)/, '1er') : s;
  };
  const num = (n) => App.fmt.number(n);

  /* ---------- Scenes ---------- */
  function sceneShell(id) {
    const el = h('div', { class: ['media-scene', `media-scene--${id}`], dataset: { scene: id }, 'aria-hidden': 'true' });
    return { id, el, beats: [], progs: [] };
  }
  function beat(scene, el, at, reveal = true) {
    scene.beats.push({ el, at, v: -1 });
    if (reveal) el.classList.add('media-beat');
    return el;
  }
  function prog(scene, el, from, to) {
    scene.progs.push({ el, from, to: Math.max(to, from + 0.01), v: -1 });
    return el;
  }
  const chapterOf = (c, id) => c.chapters.find((x) => x.id === id) || { start: 0, end: 0, speechStart: 0 };
  const markOr = (c, name, fallback) => (c.marks && typeof c.marks[name] === 'number' ? c.marks[name] : fallback);
  const swatch = (kind) => h('span', { class: ['media-swatch', `media-swatch--${kind}`] });
  const title = (text) => h('p', { class: 'media-scene-title' }, text);

  function handshake(cls) {
    const line = { fill: 'none', stroke: 'currentColor', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    return svg('svg', { class: ['media-handshake', cls], viewBox: '0 0 160 112', 'aria-hidden': 'true', focusable: 'false' },
      svg('g', { class: 'media-hs-left' },
        svg('path', { class: 'media-hs-cuff', d: 'M6 64 L30 46 L46 67 L22 85 Z' }),
        svg('path', { ...line, d: 'M33 50 L57 35 C63 31 70 31 76 34 L95 46' }),
        svg('path', { ...line, d: 'M45 67 L63 80 C67 83 72 82 74 78 C77 82 83 81 84 76 C88 79 93 77 93 72 C97 74 101 71 100 66 L92 59' })),
      svg('g', { class: 'media-hs-right' },
        svg('path', { class: 'media-hs-cuff media-hs-cuff--accent', d: 'M154 64 L130 46 L114 67 L138 85 Z' }),
        svg('path', { ...line, d: 'M127 50 L106 38 C100 35 94 35 89 39 L70 55 C66 59 68 64 73 64 C77 64 80 62 84 59 L92 53' }),
        svg('path', { ...line, d: 'M114 67 L101 65' })));
  }

  function sceneWelcome(c) {
    const s = sceneShell('welcome');
    const ch = chapterOf(c, 'welcome');
    const company = markOr(c, 'company', ch.start + 2);
    const art = prog(s, h('div', { class: 'media-s1-art' }, handshake()), ch.start, ch.start + 1.4);
    s.el.append(
      art,
      h('div', { class: 'media-s1-text' },
        h('p', { class: 'media-overline' }, t('media.s1.overline')),
        h('p', { class: 'media-s1-name' }, App.rec.clientName()),
        beat(s, h('p', { class: 'media-s1-company' }, R.client.company), company - 0.5),
        beat(s, h('p', { class: 'media-s1-effective' }, t('media.s1.effective', { date: longDate(R.effectiveDate) })), company + 0.6)));
    return s;
  }

  function sceneRelief(c) {
    const s = sceneShell('relief');
    const ch = chapterOf(c, 'relief');
    const months = markOr(c, 'months', ch.speechStart + 2);
    const interestAt = markOr(c, 'interest1600', months + 3);
    const rows = App.rec.postponementMonths();
    const orig = R.originalSchedule.slice(0, rows.length);
    const scale = Math.max(...rows.map((r, i) => orig[i].principalCents + r.interestCents)) || 1;
    const cards = rows.map((row, i) => {
      const at = months + i * 0.6;
      const pSeg = prog(s, h('span', { class: 'media-seg media-seg--principal media-seg--shrink', style: { '--w': `${((orig[i].principalCents / scale) * 100).toFixed(2)}%` } },
        h('span', { class: 'media-seg-ghost' }), h('span', { class: 'media-seg-fill' })), at, at + 1.1);
      const iSeg = h('span', { class: 'media-seg media-seg--interest', style: { '--w': `${((row.interestCents / scale) * 100).toFixed(2)}%` } });
      const swap = beat(s, h('span', { class: 'media-swap' },
        h('span', { class: 'media-swap-a' }, money(orig[i].principalCents)),
        h('span', { class: 'media-swap-b' }, t('media.s2.postponed'))), at + 0.9, false);
      return h('div', { class: 'media-month' },
        h('div', { class: 'media-month-head' },
          h('span', { class: 'media-month-name' }, fmtDate(row.date, 'month')),
          h('span', { class: 'media-month-year' }, fmtDate(row.date, 'year'))),
        h('div', { class: 'media-month-body' },
          h('div', { class: 'media-bar' }, pSeg, iSeg),
          h('div', { class: 'media-rows' },
            h('div', { class: 'media-row' }, h('span', { class: 'media-row-label' }, swatch('principal'), t('media.s2.principal')), h('span', { class: 'media-row-value' }, swap)),
            h('div', { class: 'media-row' }, h('span', { class: 'media-row-label' }, swatch('interest'), t('media.s2.interest')),
              h('span', { class: 'media-row-value' }, beat(s, h('span', null, money(row.interestCents)), interestAt - 0.3))))));
    });
    s.el.append(
      h('div', { class: 'media-scene-head' },
        title(t('media.s2.title')),
        h('p', { class: 'media-scene-sub' }, t('media.s2.period', { from: fmtDate(rows[0].date, 'monthYear'), to: fmtDate(rows[rows.length - 1].date, 'monthYear') }))),
      h('div', { class: 'media-months' }, cards),
      beat(s, h('p', { class: 'media-highlight' }, t('media.s2.interestEach', { amount: money(rows[0].interestCents) })), interestAt));
    return s;
  }

  function sceneDifference(c) {
    const s = sceneShell('difference');
    const ch = chapterOf(c, 'difference');
    const relief = markOr(c, 'relief11920', ch.speechStart + 5);
    const notForgiveness = markOr(c, 'notForgiveness', relief + 5);
    const n = num(R.change.months);
    const block = (kind, label, value, sub) => h('div', { class: ['media-block', `media-block--${kind}`] },
      h('p', { class: 'media-block-label' }, label),
      h('p', { class: 'media-block-value' }, value),
      h('p', { class: 'media-block-sub' }, sub));
    s.el.append(
      h('div', { class: 'media-scene-head' }, title(t('media.s3.title'))),
      h('div', { class: 'media-eq3' },
        block('principal', t('media.s3.deferred'), money(D.principalDeferredCents), t('media.s3.deferredSub')),
        beat(s, h('span', { class: 'media-op' }, t('media.s3.minus')), relief - 1.2),
        beat(s, block('interest', t('media.s3.extra'), money(D.additionalInterestFirstThreeMonthsCents), t('media.s3.extraSub', { n })), relief - 1.2),
        beat(s, h('span', { class: 'media-op' }, t('media.s3.equals')), relief - 0.2),
        beat(s, block('relief', t('media.s3.relief'), money(D.nearTermPaymentReductionCents), t('media.s3.reliefSub', { n })), relief - 0.2)),
      beat(s, h('p', { class: 'media-callout' }, App.ui.icon('info', { size: 22 }), h('span', null, t('media.s3.notForgiveness'))), notForgiveness - 0.2));
    return s;
  }

  function sceneTradeoff(c) {
    const s = sceneShell('tradeoff');
    const ch = chapterOf(c, 'tradeoff');
    const extra = markOr(c, 'extra4800', ch.speechStart + 5);
    const maturity = markOr(c, 'maturity', extra + 4);
    const caps = chapterCaptions(c.locale || S().locale, 'tradeoff');
    const subAt = caps[1] ? caps[1].start : ch.speechStart + 1.3;
    const origLast = R.originalSchedule[R.originalSchedule.length - 1];
    const ext = R.revisedSchedule.slice(R.originalSchedule.length);
    const cells = [origLast, ...ext];
    const nCells = cells.length;
    const extFill = prog(s, h('span', { class: 'media-tl-ext' }), maturity - 0.2, maturity + 1.6);
    s.el.append(
      h('div', { class: 'media-scene-head' },
        title(t('media.s4.title')),
        beat(s, h('p', { class: 'media-scene-sub' }, t('media.s4.sub')), subAt - 0.2)),
      h('div', { class: 'media-s4-grid' },
        h('div', { class: 'media-tl' },
          h('div', { class: 'media-tl-strip', style: { '--n': String(nCells) } },
            h('div', { class: 'media-tl-track' },
              h('span', { class: 'media-tl-base' }),
              extFill,
              h('span', { class: 'media-tl-mark-orig' }),
              beat(s, h('span', { class: 'media-tl-mark-rev' }), maturity + 1.2)),
            cells.map((row, i) => h('div', { class: ['media-tl-cell', i === 0 ? 'is-original' : 'is-ext'] },
              h('span', { class: 'media-tl-month' }, fmtDate(row.date, 'monthShort')),
              h('span', { class: 'media-tl-year' }, fmtDate(row.date, 'year')))),
            beat(s, h('div', { class: 'media-tl-shift' }, t('media.s4.shift', { n: num(R.change.months) })), maturity + 1.4)),
          h('div', { class: 'media-legend' },
            h('div', { class: 'media-legend-item' }, h('span', { class: 'media-key media-key--orig' }),
              h('span', null, h('span', { class: 'media-legend-label' }, t('media.s4.original')), h('span', { class: 'media-legend-value' }, longDate(R.change.originalMaturity)))),
            beat(s, h('div', { class: 'media-legend-item' }, h('span', { class: 'media-key media-key--rev' }),
              h('span', null, h('span', { class: 'media-legend-label' }, t('media.s4.revised')), h('span', { class: 'media-legend-value' }, longDate(R.change.revisedMaturity)))), maturity + 0.9))),
        beat(s, h('div', { class: 'media-cost' },
          h('p', { class: 'media-cost-value' }, money(D.additionalLifetimeInterestCents, { signed: true })),
          h('p', { class: 'media-cost-label' }, t('media.s4.extraLabel')),
          beat(s, h('p', { class: 'media-cost-note' }, t('media.s4.includes', { amount: money(D.additionalInterestFirstThreeMonthsCents), n: num(R.change.months) })), extra + 1.2)), extra - 0.3)));
    return s;
  }

  function sceneResume(c) {
    const s = sceneShell('resume');
    const ch = chapterOf(c, 'resume');
    const resumeAt = markOr(c, 'resumeDate', ch.speechStart + 1.5);
    const payAt = markOr(c, 'payment5600', resumeAt + 4);
    const first = App.rec.firstResumed();
    const iso = R.change.resumePrincipalDate || first.date;
    const pSeg = prog(s, h('span', { class: 'media-seg media-seg--principal media-seg--grow', style: { '--w': `${((first.principalCents / first.totalCents) * 100).toFixed(2)}%` } },
      h('span', { class: 'media-seg-ghost' }), h('span', { class: 'media-seg-fill' })), payAt - 0.4, payAt + 0.9);
    const iSeg = h('span', { class: 'media-seg media-seg--interest', style: { '--w': `${((first.interestCents / first.totalCents) * 100).toFixed(2)}%` } });
    s.el.append(
      h('div', { class: 'media-scene-head' }, title(t('media.s5.title'))),
      h('div', { class: 'media-s5-grid' },
        beat(s, h('div', { class: 'media-date' },
          h('span', { class: 'media-date-month' }, fmtDate(iso, 'monthYear')),
          h('span', { class: 'media-date-day' }, num(Number(iso.slice(8, 10)))),
          h('span', { class: 'media-date-full' }, longDate(iso))), resumeAt - 0.3, false),
        h('div', { class: 'media-eq' },
          beat(s, h('div', { class: 'media-eq-head' },
            h('p', { class: 'media-eq-label' }, t('media.s5.total')),
            h('p', { class: 'media-eq-total' }, money(first.totalCents))), payAt - 0.2),
          beat(s, h('p', { class: 'media-eq-parts' },
            h('span', { class: 'media-eq-group' },
              h('span', { class: 'media-eq-sym' }, t('media.s5.equals')),
              h('span', { class: 'media-eq-part' }, swatch('principal'), h('strong', null, money(first.principalCents)), ' ', t('media.s5.principal'))),
            h('span', { class: 'media-eq-group' },
              h('span', { class: 'media-eq-sym' }, t('media.s5.plus')),
              h('span', { class: 'media-eq-part' }, swatch('interest'), h('strong', null, money(first.interestCents)), ' ', t('media.s5.interest')))), payAt + 0.5),
          h('div', { class: 'media-bar media-bar--lg' }, pSeg, iSeg),
          h('p', { class: 'media-eq-note' }, t('media.s5.first')))));
    return s;
  }

  function sceneNext(c) {
    const s = sceneShell('next-step');
    const ch = chapterOf(c, 'next-step');
    const askAt = markOr(c, 'askClair', ch.speechStart + 3);
    const questionAt = markOr(c, 'prepareQuestion', askAt + 3);
    const noAccAt = markOr(c, 'noAcceptance', questionAt + 2);
    // A picture of the options, not controls: plain icon-and-label items with
    // no button chrome. The working actions are on the end card.
    const option = (key, iconName) => h('div', { class: 'media-option' },
      h('span', { class: 'media-option-icon' }, App.ui.icon(iconName, { size: 22 })),
      h('span', { class: 'media-option-text' }, t(`media.s6.${key}`)));
    s.el.append(
      h('div', { class: 'media-scene-head' }, title(t('media.s6.title'))),
      h('div', { class: 'media-options' },
        option('schedule', 'calendar'),
        beat(s, option('explain', 'sparkle'), askAt - 0.3),
        beat(s, option('ask', 'chat'), questionAt - 0.3)),
      beat(s, h('p', { class: 'media-s6-note' }, App.ui.icon('check', { size: 20 }), h('span', null, t('media.s6.noAcceptance'))), noAccAt - 0.2));
    return s;
  }

  const SCENES = { welcome: sceneWelcome, relief: sceneRelief, difference: sceneDifference, tradeoff: sceneTradeoff, resume: sceneResume, 'next-step': sceneNext };

  /* ---------- Player chrome ---------- */
  function ctlBtn({ fid, iconName, iconEl, label, text, onClick, attrs, className }) {
    return h('button', {
      type: 'button',
      class: ['media-btn', text ? 'media-btn--text' : null, className],
      fid,
      title: label,
      'aria-label': text ? null : label,
      ...(attrs || {}),
      on: { click: onClick },
    }, iconEl || App.ui.icon(iconName, { size: 20 }), text ? h('span', { class: 'media-btn-text' }, label) : null);
  }

  // Three dots ("more"): not part of the core icon set
  function moreIcon() {
    return svg('svg', { class: 'icon', viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': 'true', focusable: 'false' },
      [5, 12, 19].map((cx) => svg('circle', { cx, cy: 12, r: 2, fill: 'currentColor' })));
  }

  function focusPlay() {
    requestAnimationFrame(() => { if (ui && ui.playBtn.isConnected) ui.playBtn.focus(); });
  }

  function onStageKey(e) {
    if (!ui || e.target !== ui.stage) return;
    const k = e.key;
    if (k === ' ' || k === 'Spacebar' || k === 'Enter' || k === 'k' || k === 'K') { e.preventDefault(); toggle(); }
    else if (k === 'ArrowRight') { e.preventDefault(); seek(now() + SKIP); }
    else if (k === 'ArrowLeft') { e.preventDefault(); seek(now() - SKIP); }
  }

  function onSeekKey(e) {
    const step = { ArrowRight: SKIP, ArrowUp: SKIP, ArrowLeft: -SKIP, ArrowDown: -SKIP, PageUp: 10, PageDown: -10 }[e.key];
    if (step !== undefined) { e.preventDefault(); seek(now() + step); }
    else if (e.key === 'Home') { e.preventDefault(); seek(0); }
    else if (e.key === 'End') { e.preventDefault(); seek(duration()); }
  }

  function chapterContext(fid) {
    return { kind: 'chapter', id: 'next-step', section: App.router.current().section, period: null, fid };
  }

  function endCard() {
    const actions = [
      App.ui.button({
        label: t('media.end.schedule'),
        kind: 'primary',
        iconName: 'calendar',
        fid: 'media-end-schedule',
        href: App.router.href('payments', 'schedule'),
        onClick: (e) => {
          e.preventDefault();
          pause();
          App.ui.goWithReturn(App.router.href('payments', 'schedule'), { kind: 'chapter', id: 'next-step' }, 'media-end-schedule', 'item');
        },
      }),
    ];
    if (App.clair && App.clair.open) {
      actions.push(App.ui.button({
        label: t('media.end.clair'),
        kind: 'ghost-light',
        iconName: 'sparkle',
        fid: 'media-end-clair',
        onClick: (e) => { pause(); App.clair.open(chapterContext('media-end-clair'), e.currentTarget); },
      }));
    }
    if (App.query && App.query.open) {
      actions.push(App.ui.button({
        label: t('media.end.query'),
        kind: 'ghost-light',
        iconName: 'chat',
        fid: 'media-end-query',
        onClick: (e) => { pause(); App.query.open({ ...chapterContext('media-end-query'), topic: 'understanding' }, e.currentTarget); },
      }));
    }
    return h('div', { class: 'media-endcard', hidden: true },
      h('div', { class: 'media-endcard-inner' },
        h('p', { class: 'media-end-title' }, t('media.end.title')),
        h('div', { class: 'media-end-actions' }, actions),
        h('p', { class: 'media-end-note' }, App.ui.icon('check', { size: 18 }), h('span', null, t('media.end.text'))),
        App.ui.button({
          label: t('media.end.replay'),
          kind: 'link',
          iconName: 'replay',
          fid: 'media-end-replay',
          className: 'media-end-replay',
          onClick: () => { seek(0, { play: true }); focusPlay(); },
        })));
  }

  function build(container, opts = {}) {
    const st = S();
    const c = cues();
    // Singleton: only one player instance in the document
    if (ui && ui.root && ui.root.isConnected && ui.root.parentNode !== container) ui.root.remove();
    [...container.children].forEach((el) => { if (el.classList && el.classList.contains('media-player')) el.remove(); });
    if (resizeObs) resizeObs.disconnect();
    if (!c) {
      ui = null;
      const missing = h('div', { class: 'media-player media-player--missing' },
        h('p', { class: 'media-error' }, App.ui.icon('info'), h('span', null, t('media.missing'))));
      container.appendChild(missing);
      return missing;
    }
    const level = Math.min(5, Math.max(2, Number(opts.headingLevel) || 3));
    const reduced = App.util.prefersReducedMotion();
    const total = c.chapters.length;
    const hintId = App.util.uid('media-hint');
    const txId = App.util.uid('media-tx');
    const txHeadId = App.util.uid('media-txh');
    const chId = App.util.uid('media-ch');
    const viewId = App.util.uid('media-view');
    const u = { container, opts, scenes: [], last: {}, chapterBtns: {}, txChapters: {}, txJumps: {}, txCaps: [], capMetrics: null, lastWidth: -1, dragging: false };
    ui = u;

    // Scenes (visual; the narration text is available in captions and the transcript)
    u.scenes = c.chapters.map((ch) => (SCENES[ch.id] ? SCENES[ch.id](c) : sceneShell(ch.id)));

    // Poster
    u.poster = h('div', { class: 'media-poster', on: { click: (e) => { if (!e.target.closest('button, a')) { play(); focusPlay(); } } } },
      h('div', { class: 'media-poster-art' }, handshake('media-handshake--poster')),
      h('div', { class: 'media-poster-body' },
        h('p', { class: 'media-poster-title' }, t('media.title')),
        h('p', { class: 'media-poster-for' }, t('media.forClient', { name: App.rec.clientName(), company: R.client.company })),
        h('ul', { class: 'media-poster-meta' },
          h('li', null, App.ui.icon('clock', { size: 16 }), App.fmt.time(c.duration)),
          h('li', null, t('media.narratedIn')),
          h('li', null, t('media.captionsIncluded'))),
        h('button', {
          type: 'button',
          class: 'media-bigplay',
          fid: 'media-poster-play',
          'aria-label': t('media.playExplanation', { duration: App.fmt.timeLong(c.duration) }),
          on: { click: () => { play(); focusPlay(); } },
        }, h('span', { class: 'media-bigplay-icon' }, App.ui.icon('play', { size: 28 })), h('span', { class: 'media-bigplay-text' }, t('media.play')))));

    u.endcard = endCard();
    u.canvas = h('div', {
      class: 'media-canvas',
      on: {
        click: (e) => {
          if (e.target.closest('button, a, input, select, .media-poster, .media-endcard')) return;
          toggle();
        },
      },
    }, u.scenes.map((sc) => sc.el), u.poster, u.endcard);

    u.captionText = h('p', { class: 'media-caption-text' });
    u.caption = h('div', { class: 'media-caption' }, u.captionText);

    u.stage = h('div', {
      class: 'media-stage',
      tabindex: '0',
      role: 'group',
      'aria-roledescription': t('media.roleVideo'),
      'aria-describedby': hintId,
      fid: 'media-stage',
      on: { keydown: onStageKey },
    }, u.canvas, u.caption, h('span', { class: 'sr-only', id: hintId }, t('media.stageHint', { n: num(SKIP) })));

    // Controls
    u.playBtn = ctlBtn({ fid: 'media-play', iconName: 'play', label: t('media.play'), onClick: toggle });
    u.replayBtn = ctlBtn({ fid: 'media-replay', iconName: 'replay', label: t('media.replay'), onClick: () => seek(0, { play: true }) });
    u.time = h('span', { class: 'media-time', 'aria-hidden': 'true' });
    u.chapterLabel = h('span', { class: 'media-chapter-label' });
    u.seek = h('input', {
      type: 'range',
      class: 'media-range media-seek',
      min: '0',
      max: String(c.duration),
      step: 'any',
      value: '0',
      fid: 'media-seek',
      'aria-label': t('media.seek'),
      on: {
        input: (e) => seek(Number(e.target.value)),
        keydown: onSeekKey,
        pointerdown: () => { u.dragging = true; },
        pointerup: () => { u.dragging = false; },
        pointercancel: () => { u.dragging = false; },
        change: () => { u.dragging = false; render(true); },
      },
    });
    const ticks = h('span', { class: 'media-ticks', 'aria-hidden': 'true' },
      c.chapters.slice(1).map((ch) => h('span', { class: 'media-tick', style: { left: `${((ch.start / c.duration) * 100).toFixed(2)}%` } })));
    u.chaptersBtn = ctlBtn({
      fid: 'media-chapters-toggle',
      iconName: 'menu',
      label: t('media.chapters'),
      text: true,
      attrs: { 'aria-expanded': 'false', 'aria-controls': chId },
      onClick: () => { const s2 = S(); s2.chaptersOpen = !s2.chaptersOpen; render(true); },
    });
    u.speed = h('select', {
      class: 'media-select',
      fid: 'media-speed',
      'aria-label': t('media.speed'),
      title: t('media.speed'),
      on: {
        change: (e) => {
          const r = Number(e.target.value);
          if (!RATES.includes(r)) return;
          S().rate = r;
          applyAudioSettings();
          savePref('rate', r);
          render(true);
        },
      },
    }, RATES.map((r) => h('option', { value: String(r) }, t('media.speedValue', { rate: num(r) }))));
    u.ccBtn = ctlBtn({
      fid: 'media-captions',
      iconName: 'captions',
      label: t('media.captions'),
      text: true,
      attrs: { 'aria-pressed': 'true' },
      onClick: () => { const s2 = S(); s2.captions = !s2.captions; savePref('captions', s2.captions); render(true); },
    });
    u.txBtn = ctlBtn({
      fid: 'media-transcript-toggle',
      iconName: 'transcript',
      label: t('media.transcript'),
      text: true,
      attrs: { 'aria-expanded': 'false', 'aria-controls': txId },
      onClick: () => { const s2 = S(); s2.transcriptOpen = !s2.transcriptOpen; render(true); },
    });
    u.muteBtn = ctlBtn({
      fid: 'media-mute',
      iconName: 'volume',
      label: t('media.mute'),
      attrs: { 'aria-pressed': 'false' },
      onClick: () => { const s2 = S(); s2.muted = !s2.muted; applyAudioSettings(); savePref('muted', s2.muted); render(true); },
    });
    u.volume = h('input', {
      type: 'range',
      class: 'media-range media-volume',
      min: '0',
      max: '100',
      step: '5',
      fid: 'media-volume',
      'aria-label': t('media.volume'),
      on: {
        input: (e) => {
          const s2 = S();
          s2.volume = Math.min(1, Math.max(0, Number(e.target.value) / 100));
          if (s2.volume > 0 && s2.muted) { s2.muted = false; savePref('muted', false); }
          applyAudioSettings();
          savePref('volume', s2.volume);
          render(true);
        },
      },
    });
    u.fsBtn = fullscreenSupported() ? ctlBtn({ fid: 'media-fullscreen', iconName: 'fullscreen', label: t('media.fullscreen'), onClick: toggleFullscreen }) : null;
    // Narrow frames (phones) show the secondary controls (chapters, speed,
    // captions, transcript) on demand, so the control bar keeps one row of
    // buttons and the whole player fits on the screen. Wider frames always
    // show them and hide this toggle.
    u.moreBtn = ctlBtn({
      fid: 'media-more',
      iconEl: moreIcon(),
      label: t('media.moreControls'),
      className: 'media-more',
      attrs: { 'aria-expanded': 'false', 'aria-controls': viewId },
      onClick: () => { const s2 = S(); s2.moreOpen = !s2.moreOpen; render(true); },
    });

    u.controls = h('div', { class: 'media-controls' },
      h('div', { class: 'media-ctl-top' }, u.chapterLabel, u.time),
      h('div', { class: 'media-seek-wrap' }, u.seek, ticks),
      h('div', { class: 'media-ctl-row' },
        h('div', { class: 'media-ctl-group media-ctl-group--main' }, u.playBtn, u.replayBtn, u.moreBtn),
        h('div', { class: 'media-ctl-group media-ctl-group--view', id: viewId }, u.chaptersBtn,
          h('span', { class: 'media-select-wrap' }, u.speed, App.ui.icon('chevronDown', { size: 16, class: 'media-select-chevron' })),
          u.ccBtn, u.txBtn),
        h('div', { class: 'media-ctl-group media-ctl-group--sound' }, u.muteBtn, u.volume, u.fsBtn)));

    u.chaptersPanel = h('div', {
      class: 'media-chapters',
      id: chId,
      hidden: true,
      on: {
        keydown: (e) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          e.stopPropagation();
          S().chaptersOpen = false;
          render(true);
          // On a narrow frame the Chapters button may be folded away under "More controls"
          (u.chaptersBtn.getClientRects().length ? u.chaptersBtn : u.moreBtn).focus();
        },
      },
    },
      h('ol', { class: 'media-chapter-list', 'aria-label': t('media.chapterListLabel') },
        c.chapters.map((ch, i) => {
          const chTitle = t(`chapters.${ch.id}`);
          const btn = h('button', {
            type: 'button',
            class: 'media-chapter-btn',
            fid: `media-chapter-${ch.id}`,
            'aria-label': t('media.chapterItem', { n: num(i + 1), title: chTitle, time: App.fmt.time(ch.start) }),
            on: { click: () => seekChapter(ch.id, { play: true }) },
          },
          h('span', { class: 'media-ch-num' }, num(i + 1)),
          h('span', { class: 'media-ch-title' }, chTitle),
          h('span', { class: 'media-ch-meta' }, h('span', { class: 'media-ch-now' }, t('media.current')), h('span', { class: 'media-ch-time' }, App.fmt.time(ch.start))));
          u.chapterBtns[ch.id] = btn;
          return h('li', null, btn);
        })));

    // The audio error sits inside the frame, between the stage and the
    // controls, so it is next to the Play control that triggered it.
    u.error = h('div', { class: 'media-error', hidden: true }, App.ui.icon('info'), h('p', null, t('media.error')));
    u.frame = h('div', { class: 'media-frame on-dark' }, u.stage, u.error, u.controls, u.chaptersPanel);
    u.fs = h('div', { class: 'media-fs' }, u.frame);

    // Transcript built from the cue captions, so it matches the audio exactly
    const Hn = `h${level}`;
    const Hc = `h${level + 1}`;
    u.transcript = h('section', { class: 'media-transcript', id: txId, hidden: true, 'aria-labelledby': txHeadId },
      h('div', { class: 'media-tx-head' },
        h(Hn, { class: 'media-tx-title', id: txHeadId }, t('media.transcriptTitle')),
        h('p', { class: 'media-tx-meta' }, t('media.transcriptMeta', { duration: App.fmt.time(c.duration) }))),
      h('p', { class: 'media-tx-intro' }, t('media.transcriptIntro')),
      c.chapters.map((ch, i) => {
        const chTitle = t(`chapters.${ch.id}`);
        const jump = h('button', {
          type: 'button',
          class: 'media-tx-jump',
          fid: `media-tx-${ch.id}`,
          'aria-label': t('media.playFromChapter', { n: num(i + 1), title: chTitle }),
          on: { click: () => seekChapter(ch.id, { play: true }) },
        },
        h('span', { class: 'media-tx-num' }, num(i + 1)),
        h('span', { class: 'media-tx-chtitle' }, chTitle),
        h('span', { class: 'media-tx-meta-col' },
          h('span', { class: 'media-tx-time' }, App.fmt.time(ch.start)),
          h('span', { class: 'media-tx-now' }, t('media.current'))));
        u.txJumps[ch.id] = jump;
        const block = h('div', { class: 'media-tx-chapter', dataset: { chapter: ch.id } },
          h(Hc, { class: 'media-tx-heading' }, jump),
          h('p', { class: 'media-tx-text' }, chapterCaptions(st.locale, ch.id).map((cap) => {
            const el = h('span', { class: 'media-tx-cap' }, cap.text);
            u.txCaps.push({ cap, el });
            return [el, ' '];
          })));
        u.txChapters[ch.id] = block;
        return block;
      }));

    u.root = h('div', {
      class: ['media-player', reduced ? 'is-reduced' : null],
      role: 'region',
      'aria-label': t('media.playerLabel'),
      dataset: { locale: st.locale },
    }, u.fs, u.transcript);

    container.appendChild(u.root);
    // Re-measure only when the frame width changes (the overview mounts the
    // player into a detached container, so the first real width arrives here).
    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(() => {
        if (ui !== u) return;
        const w = u.frame.clientWidth;
        if (w === u.lastWidth) return;
        u.lastWidth = w;
        measureLayout();
        render(true);
      });
      resizeObs.observe(u.frame);
    }
    u.lastWidth = u.frame.clientWidth;
    render(true);
    measureLayout();
    render(true);
    return u.root;
  }

  const chapterLabelText = (c, ch) => t('media.chapterLabel', { n: num(ch.index + 1), total: num(c.chapters.length), title: t(`chapters.${ch.id}`) });

  // Width-dependent layout: reserve the tallest chapter label's height so the
  // controls never jump when the chapter (and its title length) changes, and
  // drop the cached caption metrics so they are re-measured.
  function measureLayout() {
    if (!ui) return;
    const u = ui;
    u.capMetrics = null;
    const c = cues();
    const el = u.chapterLabel;
    if (!c || !el.isConnected || !el.clientWidth) return;
    el.style.minHeight = '';
    const cur = el.textContent;
    let max = 0;
    c.chapters.forEach((ch) => {
      el.textContent = chapterLabelText(c, ch);
      max = Math.max(max, el.getBoundingClientRect().height);
    });
    el.textContent = cur;
    if (max) el.style.minHeight = `${Math.ceil(max)}px`;
  }

  // Caption line width and font, measured while the caption bar is shown.
  function captionMetrics() {
    const u = ui;
    if (u.capMetrics) return u.capMetrics;
    const box = u.caption;
    if (box.hidden || !box.clientWidth) return null;
    const bs = getComputedStyle(box);
    const ts = getComputedStyle(u.captionText);
    const px = (v) => parseFloat(v) || 0;
    const lineWidth = box.clientWidth - px(bs.paddingLeft) - px(bs.paddingRight) - px(ts.paddingLeft) - px(ts.paddingRight);
    if (lineWidth <= 0) return null;
    u.capMetrics = { lineWidth, fontSize: px(ts.fontSize) || 16, font: `${ts.fontStyle} ${ts.fontWeight} ${ts.fontSize} ${ts.fontFamily}` };
    return u.capMetrics;
  }

  /* ---------- Render: derive everything from the clock ---------- */
  function setIcon(btn, name) {
    const old = btn.querySelector('svg');
    const next = App.ui.icon(name, { size: 20 });
    if (old) btn.replaceChild(next, old); else btn.prepend(next);
  }

  function render(force) {
    if (!ui) return;
    const st = S();
    const c = cues();
    if (!c) return;
    const u = ui;
    const L = u.last;
    const dur = c.duration;
    const tm = Math.max(0, Math.min(dur, now()));
    if (audioReady()) st.time = tm;
    const playing = isPlaying();
    st.playing = playing;
    const ch = chapterAt(tm) || c.chapters[0];
    st.chapter = ch.id;
    const reduced = App.util.prefersReducedMotion();
    const poster = !st.engaged;
    const ended = st.ended && !playing;
    const err = !!st.errors[st.locale];

    if (force || L.chapter !== ch.id) {
      L.chapter = ch.id;
      const n = num(ch.index + 1);
      const totalN = num(c.chapters.length);
      const chTitle = t(`chapters.${ch.id}`);
      u.scenes.forEach((sc) => sc.el.classList.toggle('is-active', sc.id === ch.id));
      u.stage.setAttribute('aria-label', t('media.stageLabel', { title: t('media.title'), n, total: totalN, chapter: chTitle }));
      u.chapterLabel.textContent = chapterLabelText(c, ch);
      Object.entries(u.chapterBtns).forEach(([id, b]) => { if (id === ch.id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      Object.entries(u.txJumps).forEach(([id, b]) => { if (id === ch.id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      Object.entries(u.txChapters).forEach(([id, el]) => el.classList.toggle('is-current', id === ch.id));
    }
    // Watch tracking from the audio clock (identifiers only in the events)
    if (playing) trackPlayback(st.locale, tm, ch.id); else lastTick = null;
    const viewKey = `${st.locale}:${ch.id}`;
    if (playing && !viewed.has(viewKey) && (watchFor(st.locale).chapters[ch.id] || 0) >= CHAPTER_VIEW) {
      viewed.add(viewKey);
      App.events.log('video_started', { id: st.locale }); // deduplicated per locale; keeps the order started → chapter
      App.events.log('video_chapter_viewed', { id: viewKey });
    }

    // Scene beats (reveals) and continuous progress, keyed to the clock.
    // Reduced motion - or no playable audio, so no clock to drive reveals -
    // shows every scene in its final, stable state.
    const final = reduced || err;
    for (const sc of u.scenes) {
      for (const b of sc.beats) {
        const v = final ? 1 : Math.round(clamp01((tm - b.at) / BEAT) * 1000) / 1000;
        if (v !== b.v) { b.v = v; b.el.style.setProperty('--b', String(v)); }
      }
      for (const p of sc.progs) {
        const v = final ? 1 : Math.round(clamp01((tm - p.from) / (p.to - p.from)) * 1000) / 1000;
        if (v !== p.v) { p.v = v; p.el.style.setProperty('--p', String(v)); }
      }
    }

    // Captions (current chapter only, at most two lines). Without playable
    // audio there is nothing to caption: the transcript is shown instead.
    const capOn = !!st.captions && !poster && !ended && !err;
    u.caption.hidden = !capOn;
    const cap = captionAt(tm, ch);
    const text = cap && capOn ? chunkAt(cap, tm, captionMetrics()) : '';
    if (L.capText !== text) { u.captionText.textContent = text; L.capText = text; }
    u.captionText.hidden = !text;
    if (force || L.cap !== cap) {
      L.cap = cap;
      u.txCaps.forEach(({ cap: cc, el }) => el.classList.toggle('is-current', cc === cap && !poster));
    }

    // Seek bar and time
    if (!u.dragging) {
      const v = String(Math.round(tm * 100) / 100);
      if (u.seek.value !== v) u.seek.value = v;
    }
    u.seek.style.setProperty('--pct', `${dur ? ((tm / dur) * 100).toFixed(2) : 0}%`);
    // Visible clock in m:ss; the seek bar's value text in the spoken form
    // ("0 min 5 s of 1 min 0 s"), like the Play button's duration.
    const elapsed = t('media.elapsed', { current: App.fmt.time(tm), total: App.fmt.time(dur) });
    const vt = t('media.seekValue', { current: App.fmt.timeLong(tm), total: App.fmt.timeLong(dur) });
    if (force || L.vt !== vt || L.elapsed !== elapsed) {
      L.vt = vt;
      L.elapsed = elapsed;
      u.seek.setAttribute('aria-valuetext', vt);
      u.time.textContent = elapsed;
    }

    if (force || L.playing !== playing) {
      L.playing = playing;
      const label = t(playing ? 'media.pause' : 'media.play');
      u.playBtn.setAttribute('aria-label', label);
      u.playBtn.title = label;
      setIcon(u.playBtn, playing ? 'pause' : 'play');
    }

    const stateKey = `${poster}|${ended}|${err}|${st.transcriptOpen}|${st.chaptersOpen}|${st.moreOpen}|${st.captions}|${st.muted}|${st.volume}|${st.rate}|${!!document.fullscreenElement}`;
    if (force || L.state !== stateKey) {
      L.state = stateKey;
      u.poster.hidden = !poster;
      u.endcard.hidden = !ended;
      u.root.classList.toggle('is-poster', poster);
      u.root.classList.toggle('is-ended', ended);
      u.root.classList.toggle('has-error', err);
      u.root.classList.toggle('is-reduced', reduced);
      u.error.hidden = !err;
      u.transcript.hidden = !st.transcriptOpen;
      u.txBtn.setAttribute('aria-expanded', String(!!st.transcriptOpen));
      u.chaptersPanel.hidden = !st.chaptersOpen;
      u.chaptersBtn.setAttribute('aria-expanded', String(!!st.chaptersOpen));
      u.root.classList.toggle('is-more-open', !!st.moreOpen);
      u.moreBtn.setAttribute('aria-expanded', String(!!st.moreOpen));
      u.ccBtn.setAttribute('aria-pressed', String(!!st.captions));
      u.muteBtn.setAttribute('aria-pressed', String(!!st.muted));
      setIcon(u.muteBtn, st.muted || st.volume === 0 ? 'mute' : 'volume');
      const vol = Math.round(st.volume * 100);
      if (u.volume.value !== String(vol)) u.volume.value = String(vol);
      u.volume.setAttribute('aria-valuetext', t('media.volumeValue', { n: num(vol) }));
      u.volume.style.setProperty('--pct', `${vol}%`);
      u.volume.classList.toggle('is-muted', !!st.muted);
      if (u.speed.value !== String(st.rate)) u.speed.value = String(st.rate);
      if (u.fsBtn) {
        const fsOn = !!document.fullscreenElement && document.fullscreenElement === u.fs;
        const label = t(fsOn ? 'media.exitFullscreen' : 'media.fullscreen');
        u.fsBtn.setAttribute('aria-label', label);
        u.fsBtn.title = label;
        u.fsBtn.setAttribute('aria-pressed', String(fsOn));
      }
    }
  }

  /* ---------- Lifecycle wiring ---------- */
  App.i18n.onChange(() => {
    if (!syncLocale()) return;
    if (ui && ui.container && ui.container.isConnected) build(ui.container, ui.opts);
  });

  // Leaving the overview pauses playback (and so does unmounting the player).
  App.router.onChange((route) => {
    if (route.section !== 'overview' || !(ui && ui.root && ui.root.isConnected)) pause();
  });

  App.session.onReset(() => {
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch (e) { /* ignore */ }
      applyAudioSettings();
    }
    stopLoop();
    resetWatch();
    if (ui && ui.container && ui.container.isConnected) build(ui.container, ui.opts);
  });

  // A modal overlay (Clair, the query form, any dialog) makes #app inert, so
  // the player's controls can't be reached: pause the narration so it never
  // keeps speaking behind the overlay. It stays paused after the overlay
  // closes (no automatic resume).
  let inertObs = null;
  function watchOverlays() {
    if (inertObs || typeof MutationObserver !== 'function') return;
    const app = document.getElementById('app');
    if (!app) return;
    inertObs = new MutationObserver(() => {
      if (app.hasAttribute('inert') && audio && !audio.paused) pause();
    });
    inertObs.observe(app, { attributes: true, attributeFilter: ['inert'] });
  }
  watchOverlays();

  document.addEventListener('fullscreenchange', () => render(true));
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => render(true);
    if (mq.addEventListener) mq.addEventListener('change', onMotion); else if (mq.addListener) mq.addListener(onMotion);
  }

  /* ---------- Public API ---------- */
  function mount(container, opts) {
    if (!container) return null;
    watchOverlays();
    syncLocale();
    return build(container, opts || {});
  }

  function focus() {
    if (!ui || !ui.root.isConnected) return false;
    const target = !S().engaged && !ui.poster.hidden ? ui.poster.querySelector('.media-bigplay') : ui.playBtn;
    return App.util.focusEl(target);
  }

  function state() {
    const st = S();
    const tm = now();
    const ch = chapterAt(tm);
    return {
      locale: st.locale,
      time: tm,
      currentTime: tm,
      duration: duration(),
      chapter: ch ? ch.id : null,
      playing: isPlaying(),
      paused: !isPlaying(),
      rate: st.rate,
      playbackRate: audioActive() ? audio.playbackRate : st.rate,
      volume: st.volume,
      muted: st.muted,
      captions: st.captions,
      transcriptOpen: st.transcriptOpen,
      chaptersOpen: st.chaptersOpen,
      moreOpen: st.moreOpen,
      engaged: st.engaged,
      ended: st.ended,
      error: !!st.errors[st.locale],
      audioReady: audioReady(),
      audioLocale,
      decoded: Object.keys(urls).filter((k) => !!urls[k]),
      mounted: !!(ui && ui.root && ui.root.isConnected),
    };
  }

  return { mount, pause, focus, state };
})();
