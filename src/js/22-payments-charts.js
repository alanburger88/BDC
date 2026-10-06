/* Payments & impact charts (module "payments", class prefix pay-).
 * Inline SVG built with svg(); no chart library. Each chart is drawn at the
 * real pixel width of its container (so labels are never scaled down) and is
 * redrawn when that width changes. The SVG itself is decorative for assistive
 * technology: month selection uses real <button> elements laid over each
 * month group, and every chart has a text summary and a data view.
 * Values are read from App.record / App.rec; only axis scales are computed. */
(() => {
  const K = (key, params) => t(`payments.${key}`, params);
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase(App.i18n.locale) + s.slice(1) : s);
  const amount = (cents) => App.fmt.money(cents, { compact: true });

  /* ---------- measurement and scales ---------- */
  let measureCtx = null;
  function textW(str, size = 12, weight = 600) {
    try {
      if (!measureCtx) measureCtx = h('canvas').getContext('2d');
      measureCtx.font = `${weight} ${size}px ${FONT}`;
      return Math.ceil(measureCtx.measureText(String(str)).width);
    } catch (e) {
      return Math.ceil(String(str).length * size * 0.62);
    }
  }

  // Axis ticks from 0: the first step (in cents) whose ticks are at least minGap px apart.
  function ticksFor(maxCents, lengthPx, minGap, steps) {
    for (const step of steps) {
      const top = Math.ceil(maxCents / step) * step;
      const n = top / step;
      if (lengthPx / n >= minGap) return { top, values: Array.from({ length: n + 1 }, (_, i) => i * step) };
    }
    const step = steps[steps.length - 1];
    const top = Math.ceil(maxCents / step) * step;
    return { top, values: [0, top] };
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r1 = (v) => Math.round(v * 10) / 10;

  /* ---------- SVG building blocks ---------- */
  function hatch(id, kind) {
    return svg('pattern', { id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      svg('rect', { width: 6, height: 6, class: `pay-hatch-bg pay-hatch-bg--${kind}` }),
      svg('line', { x1: 1.5, y1: 0, x2: 1.5, y2: 6, class: `pay-hatch-line pay-hatch-line--${kind}` }));
  }

  // Fill attributes for a segment: series o|r, component p (principal) | i (interest)
  function segFill(ids, series, comp) {
    if (series === 'o') return { fill: `url(#${comp === 'p' ? ids.op : ids.oi})`, class: `pay-seg pay-seg--o${comp}` };
    return { class: `pay-seg pay-seg--r${comp}` };
  }

  function patternDefs() {
    const ids = { op: App.util.uid('pay-hatch-op'), oi: App.util.uid('pay-hatch-oi') };
    return { ids, defs: svg('defs', null, hatch(ids.op, 'p'), hatch(ids.oi, 'i')) };
  }

  // Rect with rounded top corners (column data-end); square at the baseline.
  function roundTop(x, y, w, hgt, r, attrs) {
    if (hgt <= 0) return null;
    const rr = Math.min(r, hgt, w / 2);
    const d = `M${r1(x)},${r1(y + hgt)}V${r1(y + rr)}Q${r1(x)},${r1(y)} ${r1(x + rr)},${r1(y)}H${r1(x + w - rr)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + rr)}V${r1(y + hgt)}Z`;
    return svg('path', { d, ...attrs });
  }

  // Rect with rounded right corners (bar data-end); square at the baseline.
  function roundRight(x, y, w, hgt, r, attrs) {
    if (w <= 0) return null;
    const rr = Math.min(r, w, hgt / 2);
    const d = `M${r1(x)},${r1(y)}H${r1(x + w - rr)}Q${r1(x + w)},${r1(y)} ${r1(x + w)},${r1(y + rr)}V${r1(y + hgt - rr)}Q${r1(x + w)},${r1(y + hgt)} ${r1(x + w - rr)},${r1(y + hgt)}H${r1(x)}Z`;
    return svg('path', { d, ...attrs });
  }

  function plainRect(x, y, w, hgt, attrs) {
    if (w <= 0 || hgt <= 0) return null;
    return svg('rect', { x: r1(x), y: r1(y), width: r1(w), height: r1(hgt), ...attrs });
  }

  // Segments of one schedule row, bottom/left first: principal then interest (zero parts skipped).
  function parts(row) {
    return [['p', row.principalCents], ['i', row.interestCents]].filter(([, v]) => v > 0);
  }

  function diffPhrase(cents) {
    if (cents === 0) return K('diff.same');
    return K(cents < 0 ? 'diff.lower' : 'diff.higher', { amount: App.fmt.money(cents, { signed: true }) });
  }

  function monthAria(m) {
    return K('chart.monthAria', {
      month: cap(App.fmt.date(m.id, 'monthYear')),
      original: m.original ? App.fmt.money(m.original.totalCents) : K('list.noPayment'),
      revised: m.revised ? App.fmt.money(m.revised.totalCents) : K('list.noPayment'),
      difference: diffPhrase(m.differenceCents),
    });
  }

  const isPostponed = (m) => !!(m.revised && m.revised.principalCents === 0);

  /* ---------- paired payment chart ---------- */
  const PAY_STEPS = [100000, 200000, 250000, 500000, 1000000];

  const PAIR_GAP = 6;   // minimum space between the two total labels of one month
  const GROUP_GAP = 10; // minimum space between neighbouring months' labels

  function payMetrics(months, fs = 12) {
    const values = months.flatMap((m) => [m.original, m.revised]).filter(Boolean).map((r) => r.totalCents);
    const maxV = Math.max(...values);
    const labelW = Math.max(...values.map((v) => textW(amount(v), fs, 600)));
    return { maxV, labelW };
  }

  /** Geometry for the vertical paired-column layout, or null when the columns and their
   * direct total labels cannot sit side by side at a legible size (then month rows are used). */
  function wideGeometry(W, months) {
    if (W < 520) return null;
    for (const fs of [12, 11]) {
      const { maxV, labelW } = payMetrics(months, fs);
      const yLabelW = textW(App.fmt.money(Math.ceil(maxV / 100000) * 100000, { whole: true }), 12, 400);
      const gw = (W - yLabelW - 14 - 8) / months.length;
      const pitch = labelW + PAIR_GAP;
      if (gw >= pitch + labelW + GROUP_GAP) return { fs, labelW, pitch };
    }
    return null;
  }

  /** 'wide' when the paired columns and their direct labels fit side by side; otherwise 'narrow'. */
  function payLayout(W, months) {
    return wideGeometry(W, months) ? 'wide' : 'narrow';
  }

  function hitButton(m, o, style, extraClass) {
    const fid = `pay-chart-${m.id}`;
    const selected = m.id === o.selectedId;
    return h('button', {
      type: 'button',
      class: ['pay-hit', extraClass, selected ? 'is-selected' : null],
      fid,
      'aria-label': monthAria(m),
      'aria-current': selected ? 'true' : null,
      dataset: { month: m.id },
      style,
      on: {
        click: () => o.onSelect && o.onSelect(m.id, fid),
        mouseenter: () => o.onPreview && o.onPreview(m.id),
        mouseleave: () => o.onPreview && o.onPreview(null),
        focus: () => o.onPreview && o.onPreview(m.id),
        blur: () => o.onPreview && o.onPreview(null),
        keydown: (e) => {
          const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
          if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return;
          const list = [...e.currentTarget.parentNode.querySelectorAll('.pay-hit')];
          const i = list.indexOf(e.currentTarget);
          let next = i;
          if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = list.length - 1;
          else next = clamp(i + keys[e.key], 0, list.length - 1);
          if (next !== i) { e.preventDefault(); list[next].focus(); }
        },
      },
    });
  }

  function hitLayer(buttons) {
    return h('div', { class: 'pay-hits', role: 'group', 'aria-label': K('chart.groupsLabel') }, buttons);
  }

  function wideChart(W, o) {
    const months = o.months;
    const geo = wideGeometry(W, months) || { fs: 11, pitch: 64 };
    const { maxV } = payMetrics(months, geo.fs);
    const plotH = W >= 900 ? 280 : 240;
    const yt = ticksFor(maxV, plotH, 44, PAY_STEPS);
    const yLabels = yt.values.map((v) => App.fmt.money(v, { whole: true }));
    const yLabelW = Math.max(...yLabels.map((s) => textW(s, 12, 400)));
    const hasPostponed = months.some(isPostponed);
    const mg = { top: 30, right: 8, bottom: hasPostponed ? 80 : 50, left: yLabelW + 14 };
    const plotW = W - mg.left - mg.right;
    const gw = plotW / months.length;
    const bw = clamp(Math.round(gw * 0.2), 20, Math.max(20, Math.min(34, geo.pitch - 12)));
    const pitch = Math.max(bw + 8, geo.pitch);
    const H = mg.top + plotH + mg.bottom;
    const base = mg.top + plotH;
    const y = (v) => base - (v / yt.top) * plotH;
    const { ids, defs } = patternDefs();
    const root = svg('svg', { class: 'pay-svg pay-svg--wide', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' }, defs);

    // selection band (behind everything)
    months.forEach((m, i) => {
      if (m.id !== o.selectedId) return;
      root.appendChild(svg('rect', { class: 'pay-svg-sel', x: r1(mg.left + i * gw + 3), y: 4, width: r1(gw - 6), height: r1(base + 46 - 4), rx: 10 }));
    });
    // gridlines + y labels
    yt.values.forEach((v, i) => {
      root.appendChild(svg('line', { class: v === 0 ? 'pay-svg-axis' : 'pay-svg-grid', x1: mg.left, x2: W - mg.right, y1: r1(y(v)), y2: r1(y(v)) }));
      root.appendChild(svg('text', { class: 'pay-svg-tick', x: mg.left - 8, y: r1(y(v)), dy: '0.35em', 'text-anchor': 'end' }, yLabels[i]));
    });

    months.forEach((m, i) => {
      const cx = mg.left + i * gw + gw / 2;
      const selected = m.id === o.selectedId;
      [['o', m.original, cx - pitch / 2], ['r', m.revised, cx + pitch / 2]].forEach(([series, row, c]) => {
        if (!row) return;
        const g = svg('g', { class: `pay-bar pay-bar--${series}` });
        const segs = parts(row);
        let acc = 0;
        segs.forEach(([comp, v], si) => {
          const yBottom = y(acc) - (si > 0 ? 1 : 0);
          acc += v;
          const isTop = si === segs.length - 1;
          const yTop = y(acc) + (isTop ? 0 : 1);
          const attrs = segFill(ids, series, comp);
          g.appendChild(isTop ? roundTop(c - bw / 2, yTop, bw, yBottom - yTop, 4, attrs) : plainRect(c - bw / 2, yTop, bw, yBottom - yTop, attrs));
        });
        g.appendChild(svg('text', { class: 'pay-svg-total', x: r1(c), y: r1(y(row.totalCents) - 7), 'text-anchor': 'middle', style: { fontSize: `${geo.fs}px` } }, amount(row.totalCents)));
        root.appendChild(g);
      });
      // month + year labels
      root.appendChild(svg('text', { class: ['pay-svg-month', selected ? 'is-selected' : null], x: r1(cx), y: base + 21, 'text-anchor': 'middle' }, cap(App.fmt.date(m.id, 'monthShort'))));
      if (i === 0 || m.id.endsWith('-01')) root.appendChild(svg('text', { class: 'pay-svg-year', x: r1(cx), y: base + 38, 'text-anchor': 'middle' }, App.fmt.date(m.id, 'year')));
    });

    // bracket under the postponed months
    if (hasPostponed) {
      const idx = months.map((m, i) => (isPostponed(m) ? i : -1)).filter((i) => i >= 0);
      const x1 = mg.left + idx[0] * gw + 10;
      const x2 = mg.left + (idx[idx.length - 1] + 1) * gw - 10;
      const by = base + 52;
      root.appendChild(svg('path', { class: 'pay-svg-bracket', d: `M${r1(x1)},${by - 5}V${by}H${r1(x2)}V${by - 5}` }));
      root.appendChild(svg('text', { class: 'pay-svg-note', x: r1((x1 + x2) / 2), y: by + 18, 'text-anchor': 'middle' }, K('chart.postponed')));
    }

    const buttons = months.map((m, i) => hitButton(m, o, { left: `${r1(mg.left + i * gw)}px`, top: '0px', width: `${r1(gw)}px`, height: `${H}px` }, 'pay-hit--col'));
    return h('div', { class: 'pay-canvas', style: { width: `${W}px`, height: `${H}px` } }, root, hitLayer(buttons));
  }

  function narrowChart(W, o) {
    const months = o.months;
    const { maxV, labelW } = payMetrics(months);
    const sLabels = [t('common.original'), t('common.revised')];
    const sW = Math.max(...sLabels.map((s) => textW(s, 12, 500))) + 20;
    const valW = labelW + 8;
    const plotX = sW;
    const plotW = Math.max(60, W - sW - valW);
    // Every bar carries its value label, so the narrow layout needs no value axis:
    // only a zero baseline per row, on a scale rounded up to a whole thousand.
    const scaleTop = Math.ceil(maxV / 100000) * 100000;
    const x = (v) => plotX + (v / scaleTop) * plotW;
    const barH = 14;
    const rowH = 82;
    const top = 4;
    const H = top + months.length * rowH;
    const { ids, defs } = patternDefs();
    const root = svg('svg', { class: 'pay-svg pay-svg--narrow', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' }, defs);

    months.forEach((m, i) => {
      if (m.id !== o.selectedId) return;
      root.appendChild(svg('rect', { class: 'pay-svg-sel', x: 0, y: top + i * rowH, width: W, height: rowH - 6, rx: 10 }));
    });
    months.forEach((m, i) => {
      const y0 = top + i * rowH;
      root.appendChild(svg('line', { class: 'pay-svg-axis', x1: r1(x(0)), x2: r1(x(0)), y1: y0 + 25, y2: y0 + 67 }));
    });

    months.forEach((m, i) => {
      const y0 = top + i * rowH;
      const selected = m.id === o.selectedId;
      const monthLabel = cap(App.fmt.date(m.id, 'monthYear'));
      root.appendChild(svg('text', { class: ['pay-svg-month', 'pay-svg-month--row', selected ? 'is-selected' : null], x: 8, y: y0 + 17 }, monthLabel));
      if (isPostponed(m) && textW(monthLabel, 13, 700) + textW(K('chart.postponed'), 11, 600) + 28 <= W) {
        root.appendChild(svg('text', { class: 'pay-svg-note pay-svg-note--tag', x: W - 8, y: y0 + 17, 'text-anchor': 'end' }, K('chart.postponed')));
      }
      [['o', m.original, 0], ['r', m.revised, 1]].forEach(([series, row, k]) => {
        const by = y0 + 28 + k * (barH + 8);
        root.appendChild(svg('text', { class: 'pay-svg-series', x: 8, y: by + barH / 2, dy: '0.35em' }, sLabels[k]));
        if (!row) {
          root.appendChild(svg('text', { class: 'pay-svg-total', x: plotX + 6, y: by + barH / 2, dy: '0.35em' }, K('list.noPayment')));
          return;
        }
        const segs = parts(row);
        let acc = 0;
        segs.forEach(([comp, v], si) => {
          const xLeft = x(acc) + (si > 0 ? 1 : 0);
          acc += v;
          const isEnd = si === segs.length - 1;
          const xRight = x(acc) - (isEnd ? 0 : 1);
          const attrs = segFill(ids, series, comp);
          root.appendChild(isEnd ? roundRight(xLeft, by, xRight - xLeft, barH, 4, attrs) : plainRect(xLeft, by, xRight - xLeft, barH, attrs));
        });
        root.appendChild(svg('text', { class: 'pay-svg-total', x: r1(x(row.totalCents) + 6), y: by + barH / 2, dy: '0.35em' }, amount(row.totalCents)));
      });
    });

    const buttons = months.map((m, i) => hitButton(m, o, { left: '0px', top: `${top + i * rowH}px`, width: `${W}px`, height: `${rowH - 6}px` }, 'pay-hit--row'));
    return h('div', { class: 'pay-canvas', style: { width: `${W}px`, height: `${H}px` } }, root, hitLayer(buttons));
  }

  /* ---------- principal balance chart ---------- */
  const BAL_STEPS = [6000000, 8000000, 12000000, 24000000];

  function balanceSvg(W) {
    const R = App.record;
    const o = R.originalSchedule;
    const r = R.revisedSchedule;
    const n = R.change.months;
    const start = R.loan.principalAtScheduleStartCents;
    const narrow = W < 520;
    const plotH = narrow ? 210 : 260;
    const yt = ticksFor(start, plotH, 38, BAL_STEPS);
    const yLabels = yt.values.map((v) => App.fmt.money(v, { whole: true }));
    const yLabelW = Math.max(...yLabels.map((s) => textW(s, narrow ? 11 : 12, 400)));
    const mg = { top: 12, right: 12, bottom: 30, left: yLabelW + 12 };
    const plotW = W - mg.left - mg.right;
    const N = r.length;
    const H = mg.top + plotH + mg.bottom;
    const base = mg.top + plotH;
    const x = (i) => mg.left + (i / N) * plotW;
    const y = (v) => base - (v / yt.top) * plotH;
    // [domain x, cents]: the starting principal, then the closing principal after each payment
    const pts = (rows) => [[0, start], ...rows.map((row, i) => [i + 1, row.closingPrincipalCents])];
    const po = pts(o);
    const pr = pts(r);
    const pathD = (p) => p.map(([i, v], k) => `${k ? 'L' : 'M'}${r1(x(i))},${r1(y(v))}`).join('');
    const tickCls = narrow ? 'pay-svg-tick pay-svg-tick--sm' : 'pay-svg-tick';
    const root = svg('svg', { class: 'pay-svg pay-svg--balance', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' });

    root.appendChild(svg('rect', { class: 'pay-svg-band', x: r1(x(0)), y: mg.top, width: r1(x(n) - x(0)), height: plotH }));
    yt.values.forEach((v, i) => {
      root.appendChild(svg('line', { class: v === 0 ? 'pay-svg-axis' : 'pay-svg-grid', x1: mg.left, x2: W - mg.right, y1: r1(y(v)), y2: r1(y(v)) }));
      root.appendChild(svg('text', { class: tickCls, x: mg.left - 7, y: r1(y(v)), dy: '0.35em', 'text-anchor': 'end' }, yLabels[i]));
    });
    // year ticks at the start of each year (after the December payment)
    const yearTicks = App.rec.months.filter((m) => m.id.endsWith('-12')).map((m) => ({ xi: m.index + 1, label: String(Number(m.id.slice(0, 4)) + 1) }));
    const yearW = textW('2032', narrow ? 11 : 12, 400) + 8;
    const every = (x(12) - x(0)) >= yearW ? 1 : 2;
    yearTicks.forEach((tk, i) => {
      const xx = r1(x(tk.xi));
      root.appendChild(svg('line', { class: 'pay-svg-axis', x1: xx, x2: xx, y1: base, y2: base + 5 }));
      if (i % every !== 0) return;
      const fits = x(tk.xi) + yearW / 2 <= W;
      root.appendChild(svg('text', { class: tickCls, x: fits ? xx : W - 1, y: base + 20, 'text-anchor': fits ? 'middle' : 'end' }, tk.label));
    });

    root.appendChild(svg('path', { class: 'pay-svg-line pay-svg-line--o', d: pathD(po) }));
    root.appendChild(svg('path', { class: 'pay-svg-line pay-svg-line--r', d: pathD(pr) }));
    [[po, 'o'], [pr, 'r']].forEach(([p, s]) => {
      const [i, v] = p[p.length - 1];
      root.appendChild(svg('circle', { class: `pay-svg-dot pay-svg-dot--${s}`, cx: r1(x(i)), cy: r1(y(v)), r: 4.5 }));
    });

    // Direct end labels. The revised line is always the upper one, so its label sits
    // above it at the right end of the plot (right-aligned over its final point); the
    // original label sits below the lower line, as close to its final point as fits.
    const fs = narrow ? 11 : 12;
    const lh = fs + 3;
    const lines = (series, style) => [
      K(series === 'o' ? 'balance.labelOriginal' : 'balance.labelRevised'),
      K('balance.repaid', { date: App.fmt.date(series === 'o' ? R.change.originalMaturity : R.change.revisedMaturity, style) }),
    ];
    const widthOf = (ls) => Math.max(textW(ls[0], fs, 700), textW(ls[1], fs, 400));
    const label = (ls, xx, yy, anchor, s) => svg('text', { class: `pay-svg-endlabel pay-svg-endlabel--${s}`, x: r1(xx), y: r1(yy), 'text-anchor': anchor, 'font-size': fs },
      svg('tspan', { class: 'pay-svg-endlabel-name', x: r1(xx), dy: 0 }, ls[0]),
      svg('tspan', { x: r1(xx), dy: lh }, ls[1]));
    // Value of a polyline at a fractional domain position (points are [index, cents]).
    const valueAt = (p, xi) => {
      if (xi <= p[0][0]) return p[0][1];
      for (let k = 1; k < p.length; k += 1) {
        if (xi <= p[k][0]) {
          const [x0, v0] = p[k - 1];
          const [x1, v1] = p[k];
          return v0 + ((v1 - v0) * (xi - x0)) / (x1 - x0);
        }
      }
      return p[p.length - 1][1];
    };
    const toDomain = (px) => ((px - mg.left) / plotW) * N;

    let revPlaced = false;
    for (const style of ['monthYear', 'monthYearShort']) {
      const ls = lines('r', style);
      const w = widthOf(ls);
      const xr = W - mg.right;
      const xl = xr - w;
      if (xl < mg.left + 8) continue;
      // The line descends to the right, so its highest point under the label is at the label's left edge.
      const lineY = y(valueAt(pr, toDomain(xl)));
      const yl = lineY - 8 - lh - fs * 0.25; // first baseline
      if (yl - fs * 0.85 < mg.top) continue;
      root.appendChild(label(ls, xr, yl, 'end', 'r'));
      revPlaced = true;
      break;
    }
    if (!revPlaced) {
      for (const style of ['monthYear', 'monthYearShort']) {
        const ls = lines('r', style);
        const w = widthOf(ls);
        let placed = false;
        for (let i = pr.length - 1; i > n; i -= 1) {
          const yl = y(pr[i][1]) - 10 - lh;
          if (x(i) + 4 + w > W - mg.right || yl - fs * 0.8 < mg.top) continue;
          root.appendChild(label(ls, x(i) + 4, yl, 'start', 'r'));
          placed = true;
          break;
        }
        if (placed) break;
      }
    }
    for (const style of ['monthYear', 'monthYearShort']) {
      const ls = lines('o', style);
      const w = widthOf(ls);
      let placed = false;
      for (let i = po.length - 2; i > 0; i -= 1) {
        const yl = y(po[i][1]) + 12 + fs * 0.8;
        if (yl + lh + 4 > base) continue;
        if (x(i) - 4 - w >= mg.left + 4) { root.appendChild(label(ls, x(i) - 4, yl, 'end', 'o')); placed = true; }
        break;
      }
      if (placed) break;
    }
    return h('div', { class: 'pay-canvas', style: { width: `${W}px`, height: `${H}px` } }, root);
  }

  /* ---------- legends ---------- */
  function swatch(series, comp) {
    const { ids, defs } = patternDefs();
    return svg('svg', { class: 'pay-swatch', width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' }, defs,
      svg('rect', { x: 0, y: 0, width: 16, height: 16, rx: 3, ...segFill(ids, series, comp) }));
  }

  function paymentLegend() {
    const item = (series, comp, key) => h('li', { class: 'pay-legend-item' }, swatch(series, comp), h('span', null, K(`chart.legend.${key}`)));
    return h('ul', { class: 'pay-legend', 'aria-label': K('chart.legendLabel') },
      item('o', 'p', 'origPrincipal'), item('o', 'i', 'origInterest'), item('r', 'p', 'revPrincipal'), item('r', 'i', 'revInterest'));
  }

  function balanceLegend() {
    const R = App.record;
    const post = App.rec.postponementMonths();
    const line = (s) => svg('svg', { class: 'pay-swatch pay-swatch--line', width: 26, height: 12, viewBox: '0 0 26 12', 'aria-hidden': 'true', focusable: 'false' },
      svg('line', { class: `pay-svg-line pay-svg-line--${s}`, x1: 1, x2: 25, y1: 6, y2: 6 }));
    const band = svg('svg', { class: 'pay-swatch', width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' },
      svg('rect', { class: 'pay-svg-band pay-svg-band--swatch', x: 0.5, y: 0.5, width: 15, height: 15, rx: 3 }));
    return h('ul', { class: 'pay-legend', 'aria-label': K('chart.legendLabel') },
      h('li', { class: 'pay-legend-item' }, line('o'), h('span', null, K('balance.legend.original'))),
      h('li', { class: 'pay-legend-item' }, line('r'), h('span', null, K('balance.legend.revised'))),
      h('li', { class: 'pay-legend-item' }, band, h('span', null, K('balance.legend.band', {
        from: App.fmt.date(post[0].date, 'monthYear'),
        to: App.fmt.date(post[R.change.months - 1].date, 'monthYear'),
      }))));
  }

  /* ---------- mounting with redraw on resize ---------- */
  function mount(host, draw) {
    let lastW = 0;
    let ro = null;
    const run = (force) => {
      if (!host.isConnected) return;
      const W = Math.floor(host.clientWidth);
      if (!W || (W === lastW && !force)) return;
      lastW = W;
      // Keep keyboard focus on the same month control when a resize redraws the chart.
      const a = document.activeElement;
      const activeFid = a && host.contains(a) ? a.getAttribute('data-fid') : null;
      App.util.clear(host);
      host.appendChild(draw(W));
      const again = activeFid ? App.util.findByFid(activeFid, host) : null;
      if (again) App.util.focusEl(again, { preventScroll: true });
    };
    run(true);
    if (window.ResizeObserver) {
      ro = new ResizeObserver(App.util.debounce(() => run(false), 60));
      ro.observe(host);
    }
    return { destroy() { if (ro) ro.disconnect(); ro = null; }, redraw() { run(true); } };
  }

  /**
   * Paired payment chart. opts: { months, selectedId, onSelect(id, fid), onPreview(id|null) }
   * Draws a vertical paired-column layout when its labels fit, otherwise month rows
   * of horizontal bars designed for narrow widths (always below 520px, and whenever
   * the direct total labels would not fit side by side).
   */
  function payments(host, opts) {
    return mount(host, (W) => {
      const layout = payLayout(W, opts.months);
      host.dataset.layout = layout;
      return layout === 'wide' ? wideChart(W, opts) : narrowChart(W, opts);
    });
  }

  function balance(host) {
    return mount(host, (W) => {
      host.dataset.layout = W < 520 ? 'narrow' : 'wide';
      return balanceSvg(W);
    });
  }

  App.payments = App.payments || {};
  App.payments.charts = { payments, balance, paymentLegend, balanceLegend, payLayout, diffPhrase, textW };
})();
