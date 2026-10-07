/* InfoSlips for BDC: guided walkthrough.
 *
 * Three connected parts in one sequence of steps: Introduction (2 steps),
 * Presentation (one step per slide) and Live statement (guided stops in the live
 * Financing Change Notice, then a closing step). The URL hash names the step
 * (#/welcome, #/slides/6, #/live/clair) and the place is saved on this device.
 *
 * Persistent controls: Back, Next, Contents, Restart, Open live statement (new
 * tab), Presentation / Live statement, and Desktop / Tablet / Mobile. */
(() => {
  'use strict';

  const C = window.WT_CONTENT;
  const N = window.WT_NOTICE;
  if (!C || !N) return;

  /* ------------------------------------------------------------------ */
  /* DOM helpers                                                         */
  /* ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }
  function icon(name, cls) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', cls ? `icon ${cls}` : 'icon');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    const u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', `#i-${name}`);
    s.appendChild(u);
    return s;
  }
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  const fmt = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  const isFrame = () => mq('(min-width: 1024px) and (min-height: 620px)');
  const reducedMotion = () => mq('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------------ */
  /* Steps                                                               */
  /* ------------------------------------------------------------------ */
  const PARTS = ['intro', 'presentation', 'live'];
  const PART = C.meta.parts;
  const STEPS = [
    { id: 'welcome', part: 'intro', hash: '#/welcome', title: 'Welcome', kind: 'welcome' },
    { id: 'how', part: 'intro', hash: '#/how-it-works', title: C.how.title, kind: 'how' },
    ...C.slides.map((s) => ({ id: `slide-${s.n}`, part: 'presentation', hash: `#/slides/${s.n}`, title: s.title, kind: 'slide', slide: s })),
    ...C.live.stops.map((s) => ({ id: `live-${s.id}`, part: 'live', hash: `#/live/${s.id}`, title: s.title, kind: s.close ? 'close' : 'stop', stop: s })),
  ];
  const partSteps = {};
  PARTS.forEach((p) => { partSteps[p] = STEPS.filter((s) => s.part === p); });
  STEPS.forEach((s, i) => { s.index = i; s.partIndex = partSteps[s.part].indexOf(s); });
  const byId = Object.fromEntries(STEPS.map((s) => [s.id, s]));
  const slideStep = (n) => byId[`slide-${n}`];
  const stopStep = (id) => byId[`live-${id}`];
  const DEV = C.devices;

  function stepLabel(step) {
    const count = partSteps[step.part].length;
    if (step.kind === 'slide') return `Slide ${step.slide.n} of ${count}`;
    if (step.part === 'live') return step.kind === 'close' ? 'Wrap-up' : `Stop ${step.partIndex + 1} of ${count - 1}`;
    return `Step ${step.partIndex + 1} of ${count}`;
  }

  /* ------------------------------------------------------------------ */
  /* State (saved on this device)                                        */
  /* ------------------------------------------------------------------ */
  const KEY = 'isw-bdc-walkthrough-v1';
  const defaultDevice = () => (window.innerWidth >= 1024 ? 'desktop' : window.innerWidth >= 700 ? 'tablet' : 'mobile');
  const st = { index: 0, lastSlide: 1, lastStop: 'meet', device: defaultDevice(), visited: new Set(), resumeId: null };

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d || typeof d !== 'object') return;
      if (slideStep(d.lastSlide)) st.lastSlide = d.lastSlide;
      if (stopStep(d.lastStop) && stopStep(d.lastStop).kind === 'stop') st.lastStop = d.lastStop;
      if (DEV[d.device]) st.device = d.device;
      if (Array.isArray(d.visited)) st.visited = new Set(d.visited.filter((id) => byId[id]));
      if (byId[d.resumeId] && d.resumeId !== 'welcome') st.resumeId = d.resumeId;
    } catch (e) { /* storage unavailable: start fresh */ }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        lastSlide: st.lastSlide, lastStop: st.lastStop, device: st.device, visited: [...st.visited], resumeId: st.resumeId,
      }));
    } catch (e) { /* ignore */ }
  }
  function clearSaved() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  /* ------------------------------------------------------------------ */
  /* Elements                                                            */
  /* ------------------------------------------------------------------ */
  const el = {
    main: $('main'),
    page: $('layer-page'),
    live: $('layer-live'),
    parts: $('parts-list'),
    back: $('btn-back'),
    next: $('btn-next'),
    open: $('btn-open'),
    restart: $('btn-restart'),
    contents: $('btn-contents'),
    progressText: $('progress-text'),
    progressNext: $('progress-next'),
    progressBar: $('progress-bar'),
    stripText: $('progress-text-strip'),
    stripBar: $('progress-bar-strip'),
    mode: $('mode-switch'),
    device: $('device-switch'),
    announcer: $('announcer'),
    dlgContents: $('dlg-contents'),
    contentsBody: $('contents-body'),
    dlgRestart: $('dlg-restart'),
    dlgSlide: $('dlg-slide'),
  };

  let announceTimer = null;
  function announce(msg) {
    clearTimeout(announceTimer);
    el.announcer.textContent = '';
    announceTimer = setTimeout(() => { el.announcer.textContent = msg; }, 80);
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */
  function indexFromHash(hash) {
    const clean = String(hash || '').replace(/\/+$/, '');
    const s = STEPS.find((x) => x.hash === clean);
    return s ? s.index : -1;
  }

  function setHash(step) {
    if (location.hash === step.hash) return;
    try { history.replaceState(history.state, '', step.hash); } catch (e) { location.replace(step.hash); }
  }

  /** Go to a step. opts.focus: 'heading' moves focus to the new step's heading;
   * opts.keep keeps focus on the control that was used (Back, Next, a switch). */
  function go(target, opts = {}) {
    const step = typeof target === 'number' ? STEPS[target] : (typeof target === 'string' ? byId[target] : target);
    if (!step) return;
    const prev = STEPS[st.index];
    st.index = step.index;
    st.visited.add(step.id);
    if (step.kind === 'slide') st.lastSlide = step.slide.n;
    if (step.kind === 'stop') st.lastStop = step.stop.id;
    if (step.id !== 'welcome') st.resumeId = step.id;
    setHash(step);
    save();
    render(prev, opts);
  }
  const next = (opts) => { if (st.index < STEPS.length - 1) go(st.index + 1, opts); };
  const back = (opts) => { if (st.index > 0) go(st.index - 1, opts); };

  function goPart(part, opts) {
    if (part === 'presentation') go(slideStep(st.lastSlide), opts);
    else if (part === 'live') go(stopStep(st.lastStop), opts);
    else go('welcome', opts);
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  let lastRendered = null;

  function render(prev, opts = {}) {
    const step = STEPS[st.index];
    const activeBefore = document.activeElement;
    renderParts(step);
    renderProgress(step);
    renderNav(step);
    renderSwitches(step);
    if (step.kind === 'stop') showLive(step, prev);
    else showPage(step, prev);
    document.title = step.id === 'welcome' ? 'InfoSlips for BDC · Guided walkthrough' : `${pageTitle(step)} · InfoSlips for BDC`;

    if (!isFrame() && prev && prev !== step && !opts.noScroll) window.scrollTo({ top: 0, behavior: 'auto' });

    const focusLost = !document.activeElement || document.activeElement === document.body
      || (activeBefore && !activeBefore.isConnected) || !!(document.activeElement.closest && document.activeElement.closest('[inert]'));
    if (opts.focus === 'heading' || (focusLost && lastRendered)) focusHeading();
    else if (opts.keep && opts.keep.isConnected && !opts.keep.disabled) opts.keep.focus({ preventScroll: true });
    else if (opts.keep && opts.keep.disabled) (step.index === STEPS.length - 1 ? el.back : el.next).focus({ preventScroll: true });

    if (lastRendered && lastRendered !== step) announce(`${PART[step.part].label}. ${stepLabel(step)}: ${step.title}`);
    lastRendered = step;
    updateOpenHref();
  }

  function pageTitle(step) {
    if (step.kind === 'slide') return `Slide ${step.slide.n}: ${step.title}`;
    if (step.kind === 'stop') return `Live statement: ${step.title}`;
    return step.title;
  }

  function focusHeading() {
    const step = STEPS[st.index];
    const target = $(step.kind === 'stop' ? 'guide-title' : 'step-title');
    if (target) target.focus({ preventScroll: isFrame() });
  }

  function renderParts(step) {
    clear(el.parts);
    const current = PARTS.indexOf(step.part);
    PARTS.forEach((p, i) => {
      const done = i < current;
      const btn = h('button', {
        type: 'button', class: 'part-btn', 'aria-current': i === current ? 'step' : null,
        on: { click: () => goPart(p, { focus: 'heading' }) },
      },
      h('span', { class: 'part-num' }, done ? icon('check') : String(i + 1)),
      h('span', { class: 'part-label-long' }, PART[p].label),
      h('span', { class: 'part-label-short' }, PART[p].short),
      done ? h('span', { class: 'sr-only' }, ', completed') : null);
      el.parts.appendChild(h('li', { class: done ? 'is-done' : null }, btn));
    });
  }

  function progressBar(container, step) {
    clear(container);
    const current = PARTS.indexOf(step.part);
    PARTS.forEach((p, i) => {
      const count = partSteps[p].length;
      const fill = i < current ? 1 : i > current ? 0 : (step.partIndex + 1) / count;
      const seg = h('span', { class: 'progress-seg' }, h('span'));
      seg.style.flexGrow = String(count);
      seg.firstChild.style.width = `${Math.round(fill * 1000) / 10}%`;
      container.appendChild(seg);
    });
  }

  function renderProgress(step) {
    const part = PART[step.part];
    const text = [h('span', { class: 'progress-part' }, `${part.n}. ${part.label}`), ` · ${stepLabel(step)}`];
    append(clear(el.progressText), text);
    append(clear(el.stripText), [h('span', { class: 'progress-part' }, `${part.n}. ${part.label}`), ` · ${stepLabel(step)}`]);
    progressBar(el.progressBar, step);
    progressBar(el.stripBar, step);
    el.progressBar.setAttribute('aria-valuemax', String(STEPS.length));
    el.progressBar.setAttribute('aria-valuenow', String(step.index + 1));
    el.progressBar.setAttribute('aria-valuetext', `Step ${step.index + 1} of ${STEPS.length}: ${part.label}, ${stepLabel(step)}`);
    el.progressBar.setAttribute('aria-label', 'Walkthrough progress');
    const nxt = STEPS[step.index + 1];
    el.progressNext.textContent = nxt ? `Up next: ${nxt.kind === 'slide' ? `Slide ${nxt.slide.n}, ` : ''}${nxt.title}` : 'End of the walkthrough';
  }

  function renderNav(step) {
    el.back.disabled = step.index === 0;
    el.next.disabled = step.index === STEPS.length - 1;
  }

  function renderSwitches(step) {
    for (const b of el.mode.querySelectorAll('[data-mode]')) {
      b.setAttribute('aria-pressed', String(step.part === b.dataset.mode));
    }
    for (const b of el.device.querySelectorAll('[data-device]')) {
      b.setAttribute('aria-pressed', String(b.dataset.device === st.device));
    }
  }

  function updateOpenHref() { el.open.href = N.href(); }

  /* ------------------------------------------------------------------ */
  /* Layers                                                              */
  /* ------------------------------------------------------------------ */
  function setLayer(live) {
    el.page.classList.toggle('is-offstage', live);
    el.page.toggleAttribute('inert', live);
    el.live.classList.toggle('is-offstage', !live);
    el.live.toggleAttribute('inert', !live);
  }

  function showPage(step, prev) {
    setLayer(false);
    clear(el.page);
    if (step.kind === 'welcome') renderWelcome(el.page);
    else if (step.kind === 'how') renderHow(el.page);
    else if (step.kind === 'slide') renderSlide(el.page, step, prev);
    else if (step.kind === 'close') renderClose(el.page, step);
  }

  /** A link to another step: works as a normal link (new tab, copy) but navigates in place. */
  function stepLink(step, attrs, ...children) {
    return h('a', { href: step.hash, ...attrs, dataset: { step: step.id } }, ...children);
  }

  /* ---------- welcome ---------- */
  function renderWelcome(root) {
    const W = C.welcome;
    const resume = st.resumeId && byId[st.resumeId] && st.resumeId !== 'welcome' ? byId[st.resumeId] : null;
    const titleParts = W.title.split('work harder');
    const title = h('h1', { class: 'welcome-title', id: 'step-title', tabindex: '-1' },
      titleParts.length === 2 ? [titleParts[0], h('span', { class: 'hl' }, 'work harder'), titleParts[1]] : W.title);

    const actions = h('div', { class: 'welcome-actions' });
    if (resume) {
      actions.append(
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => go(resume, { focus: 'heading' }) } },
          h('span', null, W.resume), icon('arrowRight')),
        h('button', { type: 'button', class: 'btn btn-secondary btn-lg', on: { click: () => go('how', { focus: 'heading' }) } }, 'Start from the beginning'),
      );
    } else {
      actions.append(
        h('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => go('how', { focus: 'heading' }) } },
          h('span', null, W.start), icon('arrowRight')),
        h('button', { type: 'button', class: 'btn btn-secondary btn-lg', on: { click: () => go(stopStep('meet'), { focus: 'heading' }) } },
          icon('live'), h('span', null, W.skip)),
      );
    }

    const visual = h('div', { class: 'hero-visual', 'aria-hidden': 'true' },
      h('div', { class: 'hero-desktop' },
        h('div', { class: 'hero-desktop-bar' }, h('i'), h('i'), h('i')),
        h('img', { src: 'assets/previews/notice-desktop.webp', alt: '', width: 1920, height: 1200, decoding: 'async' })),
      h('div', { class: 'hero-phone' },
        h('div', { class: 'hero-phone-screen' }, h('img', { src: 'assets/previews/notice-mobile.webp', alt: '', width: 780, height: 1688, decoding: 'async' }))),
      h('div', { class: 'hero-badge' }, h('span', { class: 'dot' }), 'The live notice is part 3 of this walkthrough'));

    root.appendChild(h('div', { class: 'page' },
      h('div', { class: 'page-inner' },
        h('section', { class: 'welcome-hero', 'aria-labelledby': 'step-title' },
          h('div', { class: 'welcome-text' },
            h('p', { class: 'eyebrow' }, W.eyebrow),
            title,
            h('p', { class: 'lead welcome-lead' }, W.lead),
            actions,
            h('p', { class: 'welcome-meta' }, resume ? `Last visited: ${PART[resume.part].label}, ${stepLabel(resume).toLowerCase()}. ` : '', W.meta)),
          visual),
        h('div', { class: 'not-portal' },
          h('span', { class: 'not-portal-icon' }, icon('check')),
          h('p', null, h('strong', null, W.notPortal.title), ' ', W.notPortal.body)),
        h('ul', { class: 'pillars', 'aria-label': 'What InfoSlips adds' },
          W.pillars.map((p) => h('li', { class: 'pillar' },
            h('span', { class: 'pillar-icon' }, icon(p.icon)),
            h('h2', null, p.label),
            h('p', null, p.text)))))));
  }

  /* ---------- how it works ---------- */
  function renderHow(root) {
    const H = C.how;
    root.appendChild(h('div', { class: 'page' },
      h('div', { class: 'page-inner' },
        h('div', { class: 'how-head' },
          h('p', { class: 'eyebrow' }, H.eyebrow),
          h('h1', { class: 'how-title', id: 'step-title', tabindex: '-1' }, H.title),
          h('p', { class: 'lead' }, H.lead)),
        h('ol', { class: 'how-parts' },
          H.parts.map((p) => h('li', { class: 'how-part' },
            h('span', { class: 'how-part-num', 'aria-hidden': 'true' }, String(PART[p.part].n)),
            h('h2', null, h('span', { class: 'sr-only' }, `Part ${PART[p.part].n}: `), PART[p.part].label),
            h('p', null, p.text)))),
        h('h2', { class: 'how-controls-title' }, H.controlsTitle),
        h('ul', { class: 'how-controls' },
          H.controls.map((c) => h('li', { class: 'how-control' },
            h('span', { class: 'how-control-icon' }, icon(c.icon)),
            h('div', null, h('strong', null, c.label), h('p', null, c.text))))),
        h('p', { class: 'how-note' }, icon('info'), h('span', null, H.note)),
        h('div', { class: 'how-actions' },
          h('button', { type: 'button', class: 'btn btn-primary btn-lg', on: { click: () => go(slideStep(1), { focus: 'heading' }) } },
            h('span', null, H.start), icon('arrowRight'))))));
  }

  /* ---------- slide ---------- */
  const slideSrc = (n, suffix = '') => `assets/slides/slide-${String(n).padStart(2, '0')}${suffix}.webp`;

  function slideImg(s, cls) {
    return h('img', {
      class: cls || null,
      src: slideSrc(s.n),
      srcset: `${slideSrc(s.n, '-800')} 800w, ${slideSrc(s.n)} 1376w`,
      sizes: '(min-width: 1024px) 68vw, 100vw',
      alt: s.alt,
      width: 1376,
      height: Math.round(1376 / C.ratio),
      decoding: 'async',
    });
  }

  function renderSlide(root, step, prev) {
    const s = step.slide;
    const total = C.slides.length;
    const img = slideImg(s);
    if (prev && prev.kind === 'slide' && prev !== step && !reducedMotion()) img.classList.add('is-entering');

    const stage = h('div', { class: 'stage slide-stage on-dark' },
      h('figure', { class: 'slide-figure' },
        h('div', { class: 'slide-frame' }, img),
        h('figcaption', { class: 'slide-bar' },
          h('p', { class: 'slide-count' }, 'Slide ', h('b', null, String(s.n)), ` of ${total}`),
          h('button', { type: 'button', class: 'btn btn-on-dark slide-zoom-btn', 'aria-haspopup': 'dialog', on: { click: (e) => openZoom(e.currentTarget) } },
            icon('expand'), h('span', null, 'Enlarge slide')))));
    stage.style.setProperty('--ratio', String(C.ratio));

    const talk = h('div', { class: 'talk' },
      ['notice', 'why', 'keep'].filter((g) => s.talk[g]).map((g) => h('section', { class: `talk-block ${g}` },
        h('h2', null, C.talkLabels[g]),
        h('p', null, s.talk[g]))));

    const liveStop = s.live ? stopStep(s.live) : null;
    const panel = h('div', { class: 'panel' },
      h('p', { class: 'eyebrow' }, C.chapters[s.chapter]),
      h('h1', { class: 'panel-title', id: 'step-title', tabindex: '-1' }, s.title),
      h('p', { class: 'sr-only' }, `Slide ${s.n} of ${total}. Talk track follows.`),
      talk,
      liveStop ? h('div', { class: 'panel-actions' },
        stepLink(liveStop, { class: 'btn btn-outline-green' }, icon('live'), h('span', null, C.live.seeLive))) : null,
      h('details', { class: 'more' },
        h('summary', null, icon('text'), 'Read the slide text'),
        h('div', { class: 'more-body' },
          h('ul', { class: 'slide-text-list' }, s.text.map((t) => h('li', null, t))))));

    root.appendChild(h('section', { class: 'split slide-view', 'aria-labelledby': 'step-title' }, stage, panel));

    // Warm the cache for the next slide
    const nxt = C.slides[s.n];
    if (nxt) { const pre = new Image(); pre.decoding = 'async'; pre.src = slideSrc(nxt.n, window.innerWidth < 900 ? '-800' : ''); }
  }

  /* ---------- slide zoom ---------- */
  let zoomReturn = null;
  function renderZoom() {
    const step = STEPS[st.index];
    if (step.kind !== 'slide') return;
    const s = step.slide;
    const box = clear($('slide-zoom'));
    box.appendChild(h('img', { src: slideSrc(s.n), alt: s.alt, width: 1376, height: Math.round(1376 / C.ratio) }));
    $('zoom-count').textContent = `Slide ${s.n} of ${C.slides.length}`;
    $('dlg-slide-title').textContent = `Slide ${s.n}: ${s.title}`;
    $('zoom-prev').disabled = s.n === 1;
    $('zoom-next').disabled = s.n === C.slides.length;
  }
  function openZoom(trigger) {
    zoomReturn = trigger || null;
    renderZoom();
    el.dlgSlide.showModal();
    try { if (isFrame() && el.dlgSlide.requestFullscreen && !document.fullscreenElement) el.dlgSlide.requestFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
  }
  function zoomStep(dir) {
    const step = STEPS[st.index];
    if (step.kind !== 'slide') return;
    const target = slideStep(step.slide.n + dir);
    if (!target) return;
    go(target, { noScroll: true });
    renderZoom();
    announce(`Slide ${target.slide.n} of ${C.slides.length}: ${target.title}`);
  }
  $('zoom-prev').addEventListener('click', () => zoomStep(-1));
  $('zoom-next').addEventListener('click', () => zoomStep(1));
  el.dlgSlide.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); zoomStep(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); zoomStep(-1); }
  });
  el.dlgSlide.addEventListener('close', () => {
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
    const btn = el.page.querySelector('.slide-zoom-btn');
    (btn || zoomReturn || el.next).focus({ preventScroll: true });
  });
  // The zoom dialog also closes when its slide area is clicked outside the image
  $('slide-zoom').addEventListener('click', (e) => { if (e.target === e.currentTarget) el.dlgSlide.close(); });

  /* ---------- close ---------- */
  function renderClose(root, step) {
    const s = step.stop;
    const actions = h('div', { class: 'close-actions' },
      h('a', { class: 'btn btn-primary btn-lg', href: N.href(), target: '_blank', rel: 'noopener', dataset: { openNotice: '' } },
        icon('external'), h('span', null, s.open), h('span', { class: 'sr-only' }, ' (opens in a new tab)')),
      stepLink(slideStep(1), { class: 'btn btn-on-dark btn-lg' }, icon('slides'), h('span', null, s.review)),
      h('button', { type: 'button', class: 'btn btn-on-dark btn-lg', 'aria-haspopup': 'dialog', on: { click: (e) => askRestart(e.currentTarget) } },
        icon('restart'), h('span', null, s.restart)));
    const text = h('div', null,
      h('img', { class: 'close-logo', src: 'assets/logos/infoslips-logo-white.png', width: 576, height: 136, alt: 'InfoSlips' }),
      h('p', { class: 'eyebrow on-dark-text' }, s.eyebrow),
      h('h1', { id: 'step-title', tabindex: '-1' }, s.title),
      h('p', { class: 'lead' }, s.body),
      actions,
      h('p', { class: 'close-quote' }, s.quote));
    const recapItems = s.recap.map((r) => {
      const target = stopStep(r.stop);
      return h('li', null, stepLink(target, null,
        icon('check'), h('span', null, r.label), h('span', { class: 'sr-only' }, `: ${target.title}`), icon('arrowRight', 'go')));
    });
    const recap = h('div', { class: 'recap' }, h('h2', null, s.recapTitle), h('ul', null, recapItems));
    const card = h('section', { class: 'close-card on-dark', 'aria-labelledby': 'step-title' }, h('div', { class: 'close-grid' }, text, recap));
    root.appendChild(h('div', { class: 'page' }, h('div', { class: 'page-inner' }, card)));
  }

  /* ------------------------------------------------------------------ */
  /* Live statement                                                      */
  /* ------------------------------------------------------------------ */
  const CHROME = { desktop: { x: 2, y: 42 }, tablet: { x: 44, y: 44 }, mobile: { x: 28, y: 28 } };
  const live = { built: false, appliedStop: null };

  function buildLive() {
    if (live.built) return;
    live.poster = h('img', { class: 'device-poster', alt: '', decoding: 'async' });
    live.screen = h('div', { class: 'device-screen' }, live.poster);
    live.bar = h('div', { class: 'device-bar', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('span', { class: 'device-bar-title' }, 'Important financing notice'));
    live.overlay = h('div', { class: 'device-overlay', hidden: true });
    live.loading = h('div', { class: 'device-loading', hidden: true, role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Loading the live notice…');
    live.screen.append(live.overlay, live.loading);
    live.device = h('div', { class: 'device' }, live.bar, live.screen);
    live.holder = h('div', { class: 'device-holder' }, live.device);
    live.area = h('div', { class: 'device-area' }, live.holder);
    live.caption = h('p', { class: 'device-caption' });
    live.stage = h('div', { class: 'stage live-stage on-dark' }, live.area, live.caption);
    live.guide = h('div', { class: 'panel guide' });
    el.live.appendChild(h('section', { class: 'split live-view', 'aria-label': 'Live statement' }, live.stage, live.guide));
    live.built = true;

    N.onState(updateDeviceState);
    if (window.ResizeObserver) new ResizeObserver(() => layoutDevice()).observe(live.area);
    window.addEventListener('resize', () => layoutDevice());
  }

  function applyDevice() {
    const d = DEV[st.device];
    live.device.className = `device device--${st.device}`;
    live.device.dataset.state = N.state();
    live.bar.hidden = st.device !== 'desktop';
    live.screen.style.width = `${d.w}px`;
    live.screen.style.height = `${d.h}px`;
    live.poster.src = `assets/previews/notice-${st.device}.webp`;
    live.poster.alt = `Preview of the Financing Change Notice, ${d.label.toLowerCase()} view`;
    const frame = N.frame();
    if (frame) frame.title = `Live Financing Change Notice, ${d.label.toLowerCase()} view`;
    layoutDevice();
  }

  function layoutDevice() {
    if (!live.built || el.live.classList.contains('is-offstage')) return;
    const d = DEV[st.device];
    const ch = CHROME[st.device];
    const W = d.w + ch.x;
    const H = d.h + ch.y;
    const aw = live.area.clientWidth;
    const ah = isFrame() ? live.area.clientHeight : Math.min(window.innerHeight * 0.74, 980);
    if (!aw || !ah) return;
    const s = Math.max(0.1, Math.min(1, aw / W, ah / H));
    live.device.style.transform = `scale(${s})`;
    live.holder.style.width = `${Math.floor(W * s)}px`;
    live.holder.style.height = `${Math.floor(H * s)}px`;
    clear(live.caption).append(h('b', null, `${d.label} view`), ` · ${d.w} × ${d.h} · shown at ${Math.round(s * 100)}%`);
  }

  function updateDeviceState(state) {
    if (!live.built) return;
    live.device.dataset.state = state;
    live.loading.hidden = state !== 'loading';
    const ov = clear(live.overlay);
    if (state === 'blocked' || state === 'failed') {
      const blocked = state === 'blocked';
      ov.appendChild(h('div', { class: 'device-card', role: 'group', 'aria-label': 'Live notice unavailable' },
        h('h2', null, blocked ? "The live notice can't be shown inside this page" : 'The live notice is taking too long to load'),
        h('p', null, blocked
          ? 'Your browser or network may be blocking embedded pages. You can still open the live statement in its own tab.'
          : 'You can open the live statement in its own tab, or try loading it here again.'),
        h('a', { class: 'btn btn-primary', href: N.href(), target: '_blank', rel: 'noopener' }, icon('external'), h('span', null, 'Open live statement'), h('span', { class: 'sr-only' }, ' (opens in a new tab)')),
        blocked
          ? h('button', { type: 'button', class: 'btn btn-secondary', on: { click: () => N.force() } }, 'Show it here anyway')
          : h('button', { type: 'button', class: 'btn btn-secondary', on: { click: () => N.retry() } }, 'Try again')));
      ov.hidden = false;
    } else {
      ov.hidden = true;
    }
    if (state === 'ready') {
      // A stop entered while the notice was loading gets its scene now (N queues it).
      setShowMeLabel();
      updateOpenHref();
    }
  }

  function showLive(step, prev) {
    buildLive();
    setLayer(true);
    clear(el.page); // the page layer is hidden; drop its content rather than keep a stale copy
    N.mount(live.screen);
    applyDevice();
    renderGuide(step);
    if (live.appliedStop !== step.stop.id) {
      live.appliedStop = step.stop.id;
      const enter = step.stop.enter || {};
      if (Object.keys(enter).length) N.apply(enter).then(() => updateOpenHref());
    }
    requestAnimationFrame(() => layoutDevice());
  }

  let showMeBtn = null;
  let statusEl = null;

  function setShowMeLabel() {
    const step = STEPS[st.index];
    if (!showMeBtn || step.kind !== 'stop') return;
    const s = step.stop;
    let label = s.showLabel || C.live.showMe;
    if (s.show && s.show.device === 'cycle') label = st.device === 'mobile' ? 'Show it on a desktop' : 'Show it on a phone';
    if (s.show && s.show.toggleLang) label = N.locale() === 'fr-CA' ? 'Switch back to English' : 'Switch to French';
    showMeBtn.lastChild.textContent = label;
  }

  function status(msg) { if (statusEl) { statusEl.textContent = ''; setTimeout(() => { if (statusEl) statusEl.textContent = msg; }, 60); } }

  function renderGuide(step) {
    const s = step.stop;
    const count = partSteps.live.length - 1;
    showMeBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-showme', on: { click: () => showMe(step) } }, icon('pointer'), h('span', null, ''));
    statusEl = h('p', { class: 'guide-status', role: 'status' });
    const more = (s.why || s.keep) ? h('details', { class: 'more' },
      h('summary', null, icon('info'), C.live.whyLabel),
      h('div', { class: 'more-body' },
        s.why ? h('p', null, s.why) : null,
        s.keep ? h('p', { class: 'muted' }, s.keep) : null)) : null;

    append(clear(live.guide), [
      h('div', { class: 'guide-meta' },
        h('p', { class: 'eyebrow' }, `${C.live.intro} · Stop ${step.partIndex + 1} of ${count}`),
        s.pillar ? h('span', { class: 'chip' }, s.pillar) : null),
      h('h1', { class: 'panel-title', id: 'guide-title', tabindex: '-1' }, s.title),
      h('p', { class: 'guide-body' }, s.body),
      h('section', { class: 'try', 'aria-labelledby': 'try-title' },
        h('h2', { id: 'try-title' }, icon('pointer'), C.live.tryLabel),
        h('p', null, s.try)),
      h('div', { class: 'panel-actions' }, showMeBtn),
      statusEl,
      more,
      s.slide ? stepLink(slideStep(s.slide), { class: 'link-row' }, icon('slides'), h('span', null, fmt(C.live.fromSlide, { n: s.slide }))) : null,
    ]);
    setShowMeLabel();
  }

  async function showMe(step) {
    const s = step.stop;
    const spec = s.show || {};
    if (spec.device === 'cycle') {
      const target = st.device === 'mobile' ? 'desktop' : 'mobile';
      setDevice(target);
      revealStage();
      status(`Now showing the ${DEV[target].label.toLowerCase()} view. Try the other sizes in the controls.`);
      return;
    }
    if (!N.isReady()) {
      status(N.state() === 'loading'
        ? 'The live notice is still loading. Try again in a moment.'
        : 'The live notice isn’t available inside this page. Use Open live statement to try it in a new tab.');
      return;
    }
    const res = await N.apply(spec);
    if (res && res.stale) return;
    setShowMeLabel();
    updateOpenHref();
    if (res && res.ok) revealStage();
    if (res && res.ok) {
      if (spec.clair) status('Clair is open in the notice with an answer. Ask your own question there.');
      else if (spec.toggleLang) status(N.locale() === 'fr-CA' ? 'The notice is now in French.' : 'The notice is back in English.');
      else if (spec.click) status('Opened in the notice.');
      else status('Highlighted in the notice.');
    } else {
      status('That part isn’t on screen in the notice right now. Follow the steps above.');
    }
  }

  /** On small screens the guide sits below the device: bring the device back into view
   * so the visitor sees what "Show me" did. */
  function revealStage() {
    if (isFrame() || !live.built) return;
    const top = live.stage.getBoundingClientRect().top + window.scrollY - $('topbar').offsetHeight;
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function setDevice(device, opts = {}) {
    if (!DEV[device]) return;
    const changed = device !== st.device;
    st.device = device;
    save();
    const step = STEPS[st.index];
    if (step.kind !== 'stop') {
      go(stopStep(st.lastStop), { keep: opts.keep });
      return;
    }
    renderSwitches(step);
    applyDevice();
    setShowMeLabel();
    if (changed) announce(`${DEV[device].label} view, ${DEV[device].w} by ${DEV[device].h}`);
  }

  /* ------------------------------------------------------------------ */
  /* Contents and restart                                                */
  /* ------------------------------------------------------------------ */
  function renderContents() {
    const body = clear(el.contentsBody);
    const current = STEPS[st.index];
    PARTS.forEach((p) => {
      const list = h('ul', { class: 'toc-list' });
      partSteps[p].forEach((step) => {
        const here = step === current;
        const visited = st.visited.has(step.id) && !here;
        let lead;
        if (step.kind === 'slide') lead = h('span', { class: 'toc-thumb' }, h('img', { src: slideSrc(step.slide.n, '-thumb'), alt: '', loading: 'lazy', width: 320, height: 178 }));
        else if (step.kind === 'stop' || step.kind === 'close') lead = h('span', { class: 'toc-icon' }, icon(step.stop.icon));
        else lead = h('span', { class: 'toc-icon' }, icon(step.kind === 'welcome' ? 'flag' : 'info'));
        const btn = h('button', {
          type: 'button', class: 'toc-item', 'aria-current': here ? 'step' : null,
          on: { click: () => { el.dlgContents.close(); go(step, { focus: 'heading' }); } },
        },
        lead,
        step.kind === 'slide' ? h('span', { class: 'toc-n' }, String(step.slide.n)) : null,
        h('span', { class: 'toc-title' }, step.kind === 'slide' ? h('span', { class: 'sr-only' }, `Slide ${step.slide.n}: `) : null, step.title),
        here ? h('span', { class: 'toc-state' }, h('span', { class: 'toc-here' }, 'You are here'))
          : visited ? h('span', { class: 'toc-state' }, icon('check'), h('span', { class: 'sr-only' }, 'Visited')) : null);
        list.appendChild(h('li', null, btn));
      });
      body.appendChild(h('section', { class: 'toc-part', 'aria-labelledby': `toc-${p}` },
        h('h3', { id: `toc-${p}` }, `${PART[p].n}. ${PART[p].label}`),
        list));
    });
  }

  function openContents() {
    renderContents();
    el.dlgContents.showModal();
    const here = el.contentsBody.querySelector('[aria-current="step"]');
    if (here) { here.focus(); here.scrollIntoView({ block: 'center' }); }
  }

  function askRestart(trigger) {
    if (st.index === 0 && !st.visited.size) return doRestart();
    el.dlgRestart.returnFocus = trigger;
    el.dlgRestart.showModal();
  }

  let focusAfterRestart = false;
  function doRestart() {
    N.reset();
    live.appliedStop = null;
    st.lastSlide = 1;
    st.lastStop = 'meet';
    st.device = defaultDevice();
    st.visited = new Set();
    st.resumeId = null;
    clearSaved();
    go('welcome', { focus: 'heading' });
    st.visited = new Set(['welcome']);
    save();
    announce('Walkthrough restarted.');
    // Closing the dialog returns focus to its trigger; the close handler then moves it
    // to the welcome heading instead.
    if (el.dlgRestart.open) { focusAfterRestart = true; el.dlgRestart.close(); }
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */
  el.back.addEventListener('click', (e) => back({ keep: e.currentTarget }));
  el.next.addEventListener('click', (e) => next({ keep: e.currentTarget }));
  el.contents.addEventListener('click', openContents);
  el.restart.addEventListener('click', (e) => askRestart(e.currentTarget));
  $('btn-restart-confirm').addEventListener('click', doRestart);
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) d.close();
      else if (e.target === d && d !== el.dlgSlide) {
        // A click on the backdrop (outside the dialog box) closes it
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
      }
    });
  }
  el.dlgRestart.addEventListener('close', () => {
    const t = el.dlgRestart.returnFocus;
    el.dlgRestart.returnFocus = null;
    if (focusAfterRestart) { focusAfterRestart = false; focusHeading(); return; }
    if (t && t.isConnected) t.focus({ preventScroll: true });
  });

  el.mode.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) goPart(b.dataset.mode, { keep: b });
  });
  el.device.addEventListener('click', (e) => {
    const b = e.target.closest('[data-device]');
    if (b) setDevice(b.dataset.device, { keep: b });
  });

  // Keep "Open live statement" pointing at the notice section on screen
  for (const ev of ['pointerdown', 'focus', 'mouseenter']) el.open.addEventListener(ev, updateOpenHref);
  document.addEventListener('pointerdown', (e) => {
    const a = e.target.closest && e.target.closest('a[data-open-notice]');
    if (a) a.href = N.href();
  });

  // In-page step links navigate without adding history entries
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[data-step]');
    if (!a) return;
    e.preventDefault();
    go(a.dataset.step, { focus: 'heading' });
  });
  $('brand-home').addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go('welcome', { focus: 'heading' });
  });

  window.addEventListener('hashchange', () => {
    const i = indexFromHash(location.hash);
    if (i < 0) setHash(STEPS[st.index]); // an unknown address keeps the current step
    else if (i !== st.index) go(i, { focus: 'heading' });
  });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    let dir = 0;
    if (e.key === 'ArrowRight') dir = 1;
    else if (e.key === 'ArrowLeft') dir = -1;
    else if ((e.key === 'PageDown' || e.key === 'PageUp') && isFrame()) dir = e.key === 'PageDown' ? 1 : -1;
    if (!dir) return;
    e.preventDefault();
    const keep = t && t.closest && t.closest('button, a') ? t : null;
    if (dir > 0) next({ keep }); else back({ keep });
  });

  // Fetch the notice in the background once the page is idle, so part 3 opens quickly
  function prefetchNotice() {
    if (N.frame()) return;
    const conn = navigator.connection;
    if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;
    document.head.appendChild(h('link', { rel: 'prefetch', href: 'notice/index.html' }));
  }

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */
  load();
  const fromHash = indexFromHash(location.hash);
  st.index = fromHash >= 0 ? fromHash : 0;
  const first = STEPS[st.index];
  st.visited.add(first.id);
  if (first.kind === 'slide') st.lastSlide = first.slide.n;
  if (first.kind === 'stop') st.lastStop = first.stop.id;
  if (first.id !== 'welcome') st.resumeId = first.id;
  setHash(first);
  save();
  render(null, {});
  document.documentElement.classList.add('wt-ready');
  setTimeout(prefetchNotice, 2500);
})();
