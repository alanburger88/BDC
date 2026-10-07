# QA report — BDC Important Financing Notice (concept demo)

**Build under test:** `dist/index.html` (single file) · **Date:** 2026-10-06 · **Notice:** `BDC-CHG-2026-001`, record version 1.0
**Status:** all automated gates pass. Five acceptance criteria still need manual follow-up (see §4).

## 0. Recipient view (product-owner decision, 2026-10-06)

The product owner asked for the experience to read as the customer would see it. These PRD requirements are deliberately superseded:
- the §2 persistent demo banner and "illustrative / not a BDC offer" note;
- the §9 status line "Demo assistant • … No live AI connection";
- the §10 confirmation "Demo request created locally. Nothing has been sent to BDC." and the `DEMO-` reference prefix;
- the §11 NPS/demo disclaimer;
- the `DEMO-` record identifiers;
- "In this example" in the §8 narration.

What replaced them:
- Neutral identifiers: `BDC-CHG-2026-001` and `LN-4821`.
- Clair: "Answers are based on this notice."
- Query: "Request created — your question has been recorded with reference REQ-0001". It never claims BDC received it.
- Both narrations were regenerated.
- The build gate (`RECIPIENT_BANNED`) and the RV-01 acceptance check enforce the change.

The honesty guardrails are kept: no claim that a question was sent to BDC, and no invented contacts, rates, policies or eligibility.

Also at the product owner's request, the UserWay launcher now sits bottom-left via UserWay's documented `data-position` 5.

The data remains fictional; a non-visible HTML comment in the file records this. The presenter page `#/insights` is no longer linked from the recipient UI.

## 1. Scope and method

| Layer | What it checks | Command |
|---|---|---|
| Build gates | Regenerates both schedules from the fixture inputs and reconciles every derived value. Checks en-CA/fr-CA dictionary parity (keys, array lengths, placeholders). Rejects stale narration (script hash), raw-HTML APIs, network APIs, `eval`, speech synthesis, ElevenLabs endpoints/keys, unexpected absolute URLs, remote scripts/fonts, and the widget snippet appearing anything other than exactly once. | `node tools/build.mjs` |
| Smoke | Every route × EN/FR × 320/390/768/1024/1440 px: horizontal overflow (`scrollWidth ≤ clientWidth` plus per-element offenders), missing dictionary keys, console errors, unexpected requests | `node tests/smoke.mjs` |
| Module tests | 10 Playwright suites (shell, overview, changes, payments, notice, support, help, media, clair, query/insights), 1,667 assertions | `node tests/run-modules.mjs` |
| Acceptance | PRD §18 AC-01…AC-24 mapped to automated checks; manual remainder flagged | `node tests/acceptance.mjs` |
| Independent QA sweep | Seven lenses (PRD §1–9, PRD §10–19, financial accuracy, Canadian French, accessibility, visual/responsive, interaction/state), then verify-then-fix by owner area | multi-agent workflow |

**Browsers:** Chromium 141.0.7390.37 (Playwright 1.56.1, headless, Linux). Edge, Firefox, Safari, iOS Safari and Android Chrome were **not available** in this build environment (no network to install them; the environment forbids downloading browsers). Those runs remain to be done (§5).

## 2. Results

### 2.1 Automated gates (final build, 3.50 MB)

| Gate | Result |
|---|---|
| Fixture regeneration + reconciliation | ✓ passed |
| en-CA / fr-CA dictionary parity (17 namespaces, 1,329 strings) | ✓ identical shape and placeholders |
| fr-CA typography gate | ✓ no breaking space before `: ; ? ! »` or after `«` |
| Runtime-isolation lint (network APIs, eval, raw HTML, speech synthesis, ElevenLabs endpoints/keys, remote scripts/fonts, widget exactly once) | ✓ clean |
| Smoke: 7 routes × 2 languages × 5 widths (320–1440) | ✓ no overflow, no missing keys, no console errors, no unexpected requests |
| Module suites | ✓ 10/10 files, 1,667 assertions (shell 86, overview 289, changes 164, payments 136, notice 206, support 146, help 146, media 197, Clair 133, query + insights 164) |

### 2.2 Acceptance criteria (PRD §18) — `tests/results/acceptance.json`

| ID | Result | Evidence / note |
|---|---|---|
| AC-01 One-file portability | **PASS** | All six sections render via `file://` and via a static HTTP server; 3.50 MB (< 10 MB) |
| AC-02 Runtime network isolation | **PASS** | The opening → all sections → playback → language switches → Clair journey makes 0 requests other than the widget |
| AC-03 Offline operation | **PASS** | Offline context: both voiceovers decode and play (60.2 s / 62.6 s), and tabs, charts, definitions, Clair, query and survey all work |
| AC-04 Financial consistency | **PASS** | 60/63 rows, interest rule per row, totals, zero end. Key figures shown in both locales (§3) |
| AC-05 Honest cost disclosure | **PASS** | +$4,800, later maturity and "principal remains owing" are visible at 390 px with no disclosure opened |
| AC-06 Progressive discovery | **PASS** | Relief card → December → Explain with AI → Clair source → clause 3 → Back restores route, scroll and focus on the originating control |
| AC-07 Mobile navigation | **PASS** | "Sections: …" disclosure lists all six (EN/FR) and closes after a choice; no scrolling tab bar |
| AC-08 No horizontal scrolling | **PASS** | All routes, detail views, Clair and query fit at 320 px in EN and FR |
| AC-09 Zoom and input | **PARTIAL** | 400% zoom (320 px) is covered by AC-08. Keyboard-reduced viewports (390×420, 320×256) keep Clair send and the query controls reachable. **Real-device on-screen keyboard: manual.** |
| AC-10 Greeting | **PASS** | Handshake animates once per session (not on revisit or language switch), is static under reduced motion, and is aria-hidden |
| AC-11 Media quality | **PARTIAL** | Creation-time ElevenLabs audio is embedded for both languages: en-CA Sarah, 59.4 s; fr-CA Amélie (Quebec French, chosen by the product owner), 68.4 s. Loudness is matched (−17.8 / −18.5 LUFS). **Pronunciation audition: manual (§4.1).** |
| AC-12 Video-like behaviour | **PASS** | No autoplay; pause holds the clock; chapter and seek-bar seeks work; captions match cues at 1× and 1.5×; replay works; an EN chapter maps to the FR chapter start, paused |
| AC-13 Right-side assistance | **PASS** | 420 px panel anchored right on desktop, full width at 390 px, context chip shows the selected item, and focus returns |
| AC-14 Assistant integrity | **PARTIAL** | 20 seeded/paraphrased EN+FR probes route to the right intents, including limits and out-of-scope; the scope line reads "Answers are based on this notice." **Wording review: manual.** |
| AC-15 Query integrity | **PASS** | Draft → review → "Request created" with a REQ- reference; no claim that BDC received the question; no free text in events or storage |
| AC-16 Survey | **PASS** | Three labelled faces, none preselected; keyboard and tap work; the answer can be changed; no demo/NPS framing |
| AC-17 Jargon help | **PASS** | Hover previews, click pins, Escape closes and returns focus to the term |
| AC-18 Language completeness | **PASS** | Build parity gate; no ⟦missing⟧ keys at runtime in fr-CA; `lang="fr-CA"` set |
| AC-19 Widget | **PARTIAL** | Supplied snippet appears exactly once, with UserWay `data-position` 5 (bottom left, per UserWay's documentation). The Clair launcher is bottom-right, and bottom-left space is reserved, including in mobile panels. **Confirm placement on the live preview (the host is blocked here).** |
| AC-20 Cross-sell | **PASS** | Three relevant cards; external links open in a new tab with noopener; no eligibility claims; the hardship rule hides the loan card |
| AC-21 Accessibility | **PARTIAL** | axe-core finds 0 WCAG 2.x A/AA violations on all sections in EN and FR. Keyboard flows are scripted. **Screen-reader review: manual.** |
| AC-22 Record/export alignment | **PASS** | Both tabs use one shared exporter. The CSV has 63 dated rows plus the notice identity. The print view (6 pages, `tests/results/notice-print.pdf`) has no assistant or survey |
| AC-23 Privacy and secrets | **PASS** | No credentials or synthesis code; localStorage holds only the allow-listed preferences |
| AC-24 Brand/assets | **PASS** | Supplied logo embedded unaltered (1280×680, aspect preserved); no broken images; no remote fonts |

| RV-01 Recipient view | **PASS** | 12+ routes, the Clair/query/reset overlays, Clair's self-description, the CSV/print exports and both narrations were scanned in EN and FR: no demo/fictional wording |

**Totals:** 20 pass (including RV-01), 5 partial (manual follow-up), 0 fail.

### 2.3 Independent QA sweep

Seven independent lenses audited the integrated build: PRD §1–9, PRD §10–19, financial accuracy, Canadian French, accessibility (keyboard walkthrough, axe with overlays open, forced colours), visual/responsive (320–1440 px, 200%/400% zoom, short phones) and interaction/state. **73 findings** were raised: 50 in round 1 and 23 in round 2. All are now resolved. Each was reproduced before fixing; regression assertions were added for every fix.

| Round | Raised | Fixed | Already fixed / refuted | Deferred to human review |
|---|---|---|---|---|
| 1 (5 lenses) | 50 (incl. 4 duplicate pairs) | 50 | 0 | 0 (the fr-CA voice and the chapter 2 wording were resolved after product-owner decisions) |
| 2 (visual + state) | 23 | 23 | 0 | 0 |

The audits confirmed many items **as met** without findings, including:
- All fixture values, reconciliations and dates, which do not shift across time zones UTC−12 … UTC+14.
- The exact banner, greeting, headline, CTA, status line, confirmation and survey strings in both languages.
- The full example journey, on desktop and at 390 px.
- 16/16 required Clair intents, across 60+ paraphrases.
- No inner horizontal scroll containers at 320 px.

Notable fixes:
- **Navigation:**
  - In-app "Back to…" now steps browser history instead of adding entries.
  - Hardware/browser Back closes an open panel and leaves the page as it was.
  - Back → Forward → Back keeps the reading context.
- **Clair:** the first and last postponement payments are now answered correctly. French questions about « Hypothèses » and « Mon taux va-t-il changer? » now work. Requests to change payments get limits plus "Ask a person". The context chip stays visible. Source links never point back at the place just explained.
- **Media:** fits one phone screen; pauses whenever a panel opens; completion is logged only after a real watch; controls stay visible in forced colours; scene 6 depictions are no longer mistaken for buttons.
- **Exports:** both tabs use one CSV exporter. The derived-looking 6-month and yearly sums are now labelled as sums of the rows shown.
- **French:** elision (« d’octobre »), agreement (« Rédigée », « ils sont arrondis »), consistent terms (« assistant de démonstration », « dernier versement »), ordinals (« 1er »), no-break typography (now a build gate), and « Statistiques de la démo » replacing the ambiguous « Aperçu de la démo ».
- **Accessibility:**
  - Glossary popover contrast on dark surfaces.
  - The first tab is reachable on non-section routes; the localized nav landmark name.
  - Escape scope for popovers; no focus loss after the copy fallback; forced-colors selection states.
- **Layout:**
  - Notice payment cards no longer overlap at 530–620 px; money never splits from its currency sign; long French pills.
  - Tabs no longer overflow at 874–978 px; the launcher has a visible ring and steps aside when the section menu is open.

## 3. Financial reconciliation (AC-04)

| Check | Expected (PRD §3) | Result |
|---|---|---|
| Original schedule | 60 payments, ends 2031-10-31 at $0 | ✓ regenerated row-for-row |
| Revised schedule | 63 payments: 3 zero-principal + 60 × $4,000; ends 2032-01-31 at $0 | ✓ |
| Interest rule | opening × 8% / 12, rounded half-up to cents (integer maths) | ✓ every row |
| Total interest | $48,800.00 → $53,600.00 (+$4,800.00) | ✓ |
| Total payments | $288,800.00 → $293,600.00 | ✓ |
| Nov–Jan payments | $16,720.00 → $4,800.00 (−$11,920.00) | ✓ |
| Reconciliation | $12,000 deferred − $80 extra interest = $11,920 | ✓ build gate |
| $80 not double-counted | the $80 is inside the $4,800 | ✓ wording checks (media, Clair, notice) |
| First resumed payment | 2027-02-28: $5,600 ($4,000 + $1,600) | ✓ |
| Dates | ISO calendar dates formatted in UTC; no shift in UTC−12, UTC+14, UTC−3:30 | ✓ |

## 4. Known limitations and items requiring human review

1. **AC-11 voices.** en-CA uses the ElevenLabs premade voice "Sarah"; a Canadian English accent is not verified. fr-CA uses **Amélie** (`UJCi4DDncuo0VJDSIegj`, ElevenLabs Voice Library, Quebec French), selected by the product owner. The key cannot read voice metadata, so the ID came from public voice-library listings: confirm it in the ElevenLabs Voice Library. Both tracks still need a pronunciation audition (amounts, dates, "Atelier Boréal", "Clair"). The French track was loudness-normalised (−27.5 → −18.5 LUFS) to match English, with no timing change.
2. **Narration script wording.** The audio uses the PRD draft scripts verbatim, with one approved exception: the fr-CA chapter 2 line now reads « vos remboursements de capital de novembre, décembre et janvier sont reportés » (product owner, 2026-10-06).
3. **Canadian French copy.** All fr-CA copy is implementation input. A qualified Canadian French reviewer should sign it off using `docs/content/content-review.csv` (side-by-side, with a notes column).
4. **Accessibility widget (AC-19).** The supplied snippet is included exactly once. Its host (`accessibilityserver.org`) is blocked from this environment, so the vendor launcher's bottom-left placement, its resource origins and its data handling could not be observed. The app reserves bottom-left space and keeps its own launcher bottom-right. Verify online, and confirm placement in the vendor account configuration.
5. **External links.** The four PRD-verified BDC destinations and the learning-resource pair (seasonal-business cash-flow article, EN/FR) were confirmed through search-engine indexes only, because bdc.ca is blocked from this environment. Re-check them during content approval.
6. **Manual accessibility review (AC-21).** axe-core reports 0 WCAG 2.x A/AA violations across sections and overlays, and keyboard flows are scripted. A screen-reader pass (NVDA/JAWS/VoiceOver/TalkBack) and a real-device on-screen-keyboard test (AC-09) are still required.
7. **Brand approval.** The supplied logo is embedded unaltered (1280×680 WebP, aspect preserved). Colours and type follow the supplied brief and still need BDC brand approval. The workshop image is a labelled original SVG illustration; no stock photography is used.
8. **Not production.** There is no authentication, no server-side record and no live BDC integration. Clair is a local, rule-based demo, and query/survey/review events stay in memory. These boundaries are stated in the UI.

## 5. Still to run before external use

- **Browsers:** desktop Edge, Firefox and Safari; iOS Safari; Android Chrome. Record exact versions. The code uses only widely supported APIs (container queries, `inert`, `Intl`, Blob URLs) and was written to degrade safely. Rendering and media playback were not exercised outside Chromium here.
- **Screen readers:** NVDA + Firefox, JAWS + Chrome, VoiceOver (macOS/iOS), TalkBack. Also a keyboard-only walkthrough by a person.
- **Real-device keyboard test:** query form and Clair on iOS/Android (AC-09).
- **Online checks:** the accessibility widget (load, placement, origins, data handling) and the six BDC destination URLs.
- **Approvals:** financial fixture, English copy, Canadian French copy and voice, brand/logo, accessibility, prototype engineering and information security (PRD §19).

## 6. Reproducing these results

```bash
npm install                                   # axe-core (dev only)
node tools/build.mjs                          # gates + dist/index.html
node tests/smoke.mjs                          # 7 routes × EN/FR × 5 widths
node tests/run-modules.mjs                    # 10 suites, 1,667 assertions
node tests/acceptance.mjs                     # AC-01…AC-24 → tests/results/acceptance.json + notice-print.pdf
```
