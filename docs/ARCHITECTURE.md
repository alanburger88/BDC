# Architecture and module contract

The recipient artifact is **one file**: `dist/index.html`. The source project is
split into small files for maintainability and inlined by `tools/build.mjs`.

```
src/
  index.template.html        shell HTML; build inlines styles, scripts and data
  data/fixture.json          canonical synthetic fixture (IssuedRecord input)
  assets/bdc-logo.webp       supplied BDC logo (embedded unaltered)
  assets/audio/              creation-time narration masters + cue manifests
  content/core.js            core dictionaries (common, shell, nav, items, clauses, chapters, glossary)
  content/<module>.js        each module's bilingual dictionary namespace
  content/narration.json     frozen narration scripts, voices, model (authoring input)
  js/00-core.js … 10-shell.js core framework (do not edit from a module)
  js/2x-…, 3x-…              feature modules
  js/99-boot.js              boot
  styles/00-03, 90           design system + print
  styles/2x-…, 3x-…          module styles
tools/
  fixture.mjs                regenerates + reconciles schedules; derives frozen comparison
  generate-voiceover.mjs     CREATION-TIME ElevenLabs synthesis + cue builder
  build.mjs                  packages everything into dist/index.html, lints, checks i18n parity
tests/                       Playwright QA scripts (Chromium)
```

Build: `node tools/build.mjs` (full) or
`node tools/build.mjs --modules payments --out /tmp/x/index.html` (core + one module).
Smoke: `node tests/smoke.mjs /tmp/x/index.html --routes payments --shots /tmp/x/shots`.

## Four separated models (PRD §16)

| Model | Where | Rule |
|---|---|---|
| IssuedRecord | `App.record` (deep-frozen), helpers in `App.rec` | Read-only. Build-validated. Never mutate. |
| ApprovedContent | `App.i18n` dictionaries (`content/*.js`) | Every visible string comes from here. |
| ExperienceState | `App.session.slice(name, init)`, route in `App.router` | Memory only (per tab). |
| DemoEvents | `App.events.log(type, {id})` | Identifiers only: never names, amounts, free text. |

## Hard rules for every module

1. **DOM only through `h()` / `svg()`** (global helpers). Never `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`. The build fails on these.
2. **No network APIs** (`fetch`, XHR, WebSocket, sendBeacon), no absolute URLs except `https://www.bdc.ca/...` destinations in content. No speech synthesis.
3. **Every string via `t('ns.key', params)`** (or `tv()` for arrays/objects) from your module's namespace, registered once with both `en-CA` and `fr-CA` and **identical shape** (the build fails on any key/array-length/placeholder mismatch). Amounts and dates are passed in as params formatted with `App.fmt`; never hard-code a formatted number in copy.
4. **Financial values come from `App.record` / `App.rec`** (fixture or build-time derived values). No fresh arithmetic presented as a new financial fact (simple display selection is fine).
5. **Storage:** no localStorage/sessionStorage. Use `App.session.slice()`. Preferences only through `App.util.prefs` (allow-listed keys).
6. **Responsive:** must work at 320 px with no horizontal scrolling. Use `min-width: 0` on grid/flex children, wrap text; at narrow widths comparisons are stacked labelled cards, not wide tables. Never fix overflow with `overflow-x: hidden` on a page container.
7. **Accessibility:** semantic headings (the view's single `h1` comes from `App.ui.sectionHeader`), real buttons/links, visible focus, labels, `aria-live` via `App.announce()`. Respect `App.util.prefersReducedMotion()`.
8. **Don't edit core files** (`js/00-…`, `js/10-shell.js`, `js/99-boot.js`, `content/core.js`, `styles/00-03,90`). If you need a core change, work around it inside your module and report the needed change in your final summary.
9. **CSS:** put module styles in `styles/<nn>-<module>.css`; prefix module classes (see table). Reuse core components (`.card`, `.btn-*`, `.badge`, `.compare`, `.kv`, `.grid-*`, `.split`, `.segmented`, `.field`, `.data-table`, `.hero`, `.callout`, `.chip`).
10. **Tone:** helpful, institutional, plain language. Never call deferred principal or lower near-term payments “forgiveness”, “savings”, “interest-free” or a “holiday”. The $80 is part of the $4,800 lifetime increase; never add it again.
11. **Recipient view (product-owner decision, 2026-10-06):** the app reads as the recipient would see a real notice, so no demo/fictional/sample/illustrative/prototype wording in any recipient-facing copy, export, print view or narration (build gate `RECIPIENT_BANNED`; the presenter-only `insights` namespace at the unlinked `#/insights` route is exempt). The honesty guardrails still apply: never claim a question was sent to or received by BDC, and never invent contacts, policies, rates or eligibility.

## Module ownership

| Module | JS | CSS | Content namespace | Class prefix | Exposes |
|---|---|---|---|---|---|
| overview | `js/20-overview.js` | `styles/20-overview.css` | `overview` | `ov-` | view `overview` |
| changes | `js/21-changes.js` | `styles/21-changes.css` | `changes` | `chg-` | view `changes` |
| payments | `js/22-payments.js` (+ `22-payments-charts.js`) | `styles/22-payments.css` | `payments` | `pay-` | view `payments` |
| notice | `js/23-notice.js` | `styles/23-notice.css` | `notice` | `ntc-` | view `documents`, `App.print.prepare(root)`, `App.notice` |
| support | `js/24-support.js` | `styles/24-support.css` | `support` | `sup-` | view `support` |
| help | `js/25-help.js` | `styles/25-help.css` | `help` | `hlp-` | view `help`, `App.survey` |
| media | `js/30-media.js` | `styles/30-media.css` | `media` | `media-` | `App.media.mount(container)` |
| clair | `js/31-clair.js` | `styles/31-clair.css` | `clair` | `clair-` | `App.clair.open(ctx, trigger)` |
| query | `js/32-query.js` | `styles/32-query.css` | `query` | `qry-` | `App.query.open(ctx, trigger)` |
| insights | `js/33-insights.js` | `styles/33-insights.css` | `insights` | `ins-` | view `insights` |

Cross-module calls must be guarded (`if (App.media) …`) so an isolated build still renders.

## Core API reference

### DOM and formatting
- `h(tag, attrs, ...children)`, `svg(tag, attrs, ...children)` — attrs: `class` (string|array), `text`, `style` (object; `--vars` ok), `on: {click}`, `dataset`, `fid` (stable focus id → `data-fid`), `ref(el)`, any attribute. Children: strings become text nodes; arrays flatten; null/false skipped.
- `App.util`: `clear(el)`, `uid(prefix)`, `normalize(str)` (lowercase, accent-free), `downloadBlob(name, mime, content)`, `copyText(text)` → Promise<bool>, `debounce`, `prefersReducedMotion()`, `focusables(root)`, `findByFid(fid)`, `focusEl(el)`, `isNarrow()` (<600px), `prefs.get/set` (keys: locale, captions, volume, muted, rate).
- `App.fmt`: `money(cents, {compact, whole, signed})` (locale-aware CAD, e.g. `$1,600.00` / `1 600,00 $`; `compact` drops `.00`), `decimal(cents)` (`1600.00`, for CSV), `date(iso, style)` with styles `long` (November 30, 2026 / 30 novembre 2026), `medium`, `dayMonth`, `dayMonthShort`, `monthYear`, `monthYearShort`, `month`, `monthShort`, `year` — UTC-safe; also accepts `yyyy-mm`. `percentFromBp(800)` → `8.00%` / `8,00 %`. `time(sec)` → `1:05`.

### Content
- `App.i18n.register('ns', {'en-CA': {...}, 'fr-CA': {...}})` once per namespace.
- `t('ns.path', {param})` → string; `tv('ns.path')` → raw array/object; `App.i18n.locale`; `App.i18n.onChange(fn(next, prev))`.
- Locale change already re-renders the shell and current view (`App.router.rerender()`), preserving focus (by `data-fid`) and scroll. Overlays that are open must re-render themselves via `App.i18n.onChange`.
- Rich strings: `App.ui.rich('Your [[principal|principal]] payments…')` turns `[[termId|text]]` into glossary triggers; `App.ui.plain(str)` strips markers.

### Record (`App.record`, `App.rec`)
- `App.record`: fixture fields (`noticeId`, `recordVersion`, `issueDate`, `effectiveDate`, `client`, `loan`, `change`, `assumptions`, `originalSchedule[60]`, `revisedSchedule[63]`) plus build-time `derived` (fixture fields plus `originalNearTermPaymentsCents` 1672000, `revisedNearTermPaymentsCents` 480000, `postponementMonthlyInterestCents` 160000, `firstResumedPaymentCents` 560000, `firstResumedInterestCents` 160000, `originalPaymentCount`, `revisedPaymentCount`), `comparison[63]`, `comparisonYears`.
- Schedule row: `{date, openingPrincipalCents, principalCents, interestCents, totalCents, closingPrincipalCents}`.
- `App.rec.months` = comparison rows `{index, id:'2026-11', date, original|null, revised|null, differenceCents (revised−original total), interestDifferenceCents}`; `App.rec.month(id)`, `isMonthId(id)`, `range('3'|'6'|'all')`, `years`, `monthsInYear(y)`, `postponementMonths()`, `nextPayment()`, `firstResumed()`, `clientName()`.
- Canonical id lists: `App.SECTIONS`, `App.CLAUSES` (purpose, amendment, postponement, interest, resumption, maturity, cost, unchanged, action, schedule, assumptions, contact), `App.CHANGE_CARDS` (principal, interest, next-payment, maturity, fees, rate, debt), `App.SUMMARY_CARDS` (next-payment, resume, relief, extra-interest), `App.TERMS`, `App.CHAPTERS`, `App.RESOURCES` (financial-management, working-capital, learning).
- `App.config.rules.suppressBorrowingPromotion()` — hardship/arrears demo rule.

### Routing
- Routes `#/<section>[/<item>[/<sub>]]`. Items: identifiers only.
  - `#/changes/<cardId>` detail; `#/payments/<yyyy-mm>` selected month, `#/payments/relief`, `#/payments/cost`, `#/payments/schedule`; `#/documents/<clauseId>`; `#/help/faq/<faqId>`, `#/help/glossary/<termId>`, `#/help/survey`, `#/help/ask`; `#/support/<resourceId>`; `#/insights`.
- `App.router.registerView(section, { render(el, route, opts) → {itemEl?}, onLeave?(prev, next) })`. `route = {section, item, sub, hash}`. `opts` may include `initial`, `browser` (Back/Forward), `restore`, `rerender` (locale change), `focus`, `keepScroll`, `origin`. Return `{ itemEl }` to have the router scroll to and focus the targeted item.
- `App.router.go(target, { origin: {fid, ctx}, focus: 'heading'|'item'|<fid>|false, replace, keepScroll })`.
- `App.ui.goWithReturn(target, originCtx, fid)` — navigate and push a "Back to …" entry. `App.ui.backControl()` renders the back button when the current place was reached that way (put it at the top of detail/target views). Back restores scroll and focuses the originating control.
- `App.router.onChange(fn(route, prev, opts))`, `App.router.current()`.

### Context object (Explain with AI / Ask about this / Back labels)
`{ kind, id, section, period, fid, topic? }` with kinds: `card`, `summary`, `month`, `clause`, `term`, `chapter`, `resource`, `chart`, `infographic`, `faq`, `section`, `general`. `App.ui.itemLabel(ctx)` gives the localized label. `period` is `'3'|'6'|'all'` when relevant. `topic` (query form hint): `payment` | `interest` | `maturity` | `understanding` | `other`.

### Shared UI (`App.ui`)
`icon(name)`, `button({label, kind, iconName, iconAfter, fid, onClick, href, external, ariaLabel, attrs, className})` (kinds: primary, secondary, ghost-light, link, chip, icon, plain), `badge('changed'|'unchanged'|'temporary'|'later'|'demo')`, `money(cents, opts)`, `explainButton(ctx, {fid})`, `askButton(ctx, {fid})`, `noticeLink(clauseId, originCtx)`, `routeLink({...})`, `backControl()`, `sectionHeader({overline, title, intro, extra})`, `demoNote()` ("Illustrative financing schedule, not a BDC offer." + CAD note), `term(id, text)`, `rich(str)`, `plain(str)`, `disclosure({summary, content, open, fid})`, `stableId(prefix)`.

### Overlays
- `App.overlay.open({ id, variant: 'panel'|'dialog', title, titleExtra, render(body, api), trigger, onClose, initialFocus })` — one overlay at a time (opening another closes the current; no nested traps). Panel = right side, 420px desktop, full-width on mobile, keyboard-safe height (`--vvh`). Escape, backdrop, Close button; focus returns to `trigger` (or its `data-fid` after re-render).
- `App.popover` — non-modal glossary popovers (used by `App.ui.term`).

### Events (`App.events.log(type, {id, detail})`)
`notice_opened, section_viewed, detail_opened, glossary_opened, explain_requested, video_started, video_chapter_viewed, video_completed, query_drafted, demo_query_created, survey_submitted, resource_opened, schedule_exported, language_changed, marked_reviewed`. `id`/`detail` must match `/^[a-z0-9][a-z0-9:_.-]{0,63}$/i`. Section and detail views are logged by the router automatically.

### Session slices in use
`backStack` (router), `review` (overview: `{reviewed}`), `survey` (help), `query` (query), `clair` (clair), `media` (media), `payments` (payments: range, page, expanded years), `support` (dismissed cards), `presenter` (insights: `simulateHardship`). `App.session.onReset(fn)` to clear module caches.

## Contract additions from the QA rounds

### Navigation and history
- Every history entry the app creates carries `history.state.bdcIdx`. `App.router.historyIndex()` returns the current index.
- `App.router.back()` (the in-app "Back to…" control) steps browser history back to the origin entry with `history.go(-n)` and restores scroll and focus. It pushes a new entry only when the index is unknown. Browser Back/Forward keep the return context; popped entries move to the `forwardStack` session slice.
- `App.router.start({ beforeRender(route) })` runs once the first route is resolved, before it renders. Boot logs `notice_opened` there, so it is always the first event.
- If an item is not in the known lists (cards, months, clauses, resources, FAQ ids, terms…), the router does not log a `detail_opened` event for it. Help deep links log `help:faq:<id>` / `help:glossary:<id>`.

### Overlays
- `App.overlay.open()` pushes a same-URL history entry, so browser/hardware Back closes the overlay and stays on the page. A normal close removes that entry.
- A module that closes an overlay and then navigates (Clair source links) must do both in the same task, so the router can reuse the entry (`App.overlay.takeHistoryEntry`). `App.overlay.close(reason, { keepHistory })`.
- Backdrop clicks within 350 ms of opening are ignored (double-click protection).
- On phones, full-width panels keep `--a11y-launcher-space` (72px) free at the bottom left for the vendor accessibility launcher. Each panel's pinned footer must stay the last child of `.overlay-body`.
- The media player pauses whenever `#app` becomes `inert`, i.e. whenever any overlay opens.

### Shared UI
- Item controls (`explainButton`, `askButton`, `noticeLink`, `routeLink` with return) carry `data-ctx="kind:id"`. `App.ui.enclosingCtx(el)` and `App.ui.routeCtx(route)` resolve the reader's place. `App.ui.backPlace(top)` builds the "Back to …" place label used by every back control.
- `App.ui.monthPhrase(id)` returns "December 2026", or in fr-CA "de décembre 2026" / "d’octobre 2031" (elision-aware).
- Labels with an item use `t('common.labelWithItem', {label, item})`, which renders "Label: item" in English and « Libellé : élément » (with a no-break space) in French.
- Glossary terms are inline `span[role=button]` elements, so multi-word terms can wrap. Hover previews on desktop. Click/tap/Enter pins. Below 600px, keyboard focus alone does not open them. A popover closes when focus moves to another control. Escape is handled only when focus is on the term or inside the popover.
- `App.fmt.date()` writes fr-CA ordinals (`1er novembre 2026`). Modules join day and month with a no-break space for narrow cells. `App.fmt.clock(isoTs)` formats event times.
- `App.util.copyText()` returns focus to the calling control after the fallback path.

### Exports
- `App.notice.csv(kind)` (`'revised' | 'original'`, aliases `'-full'`) returns `{ filename, content, mime }`: UTF-8 BOM, CRLF, metadata block (Notice, Record version, Status, Loan, Company, Schedule, Issue date, Effective date, Currency, Number of payments, Source, disclaimer), header, rows, Totals. The Payments tab reuses it for full schedules. Its selection CSV uses the same labels.

### Events
- `App.events.log(type, { id, detail, section })`: `section` is optional, for events logged before the first render. `glossary_opened` counts deliberate opens only, not hover previews. `query_drafted` is logged once per draft by the query module. Reset logs `notice_opened` for the new demo session.

### Build gates
- fr-CA strings must not contain an ordinary space (U+0020) before `: ; ? ! »` or after `«`. Use U+00A0 before `:` and inside `« »`, and no space before `; ? !`. The build fails otherwise.
