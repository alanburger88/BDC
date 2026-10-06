# QA report — BDC Important Financing Notice (concept demo)

**Build under test:** `dist/index.html` (single file) · **Date:** 2026-10-06 · **Notice:** `DEMO-BDC-CHANGE-2026-001`, record version 1.0
**Status: draft, completed at the end of the run** (see [Results](#results))

## 1. Scope and method

| Layer | What it checks | Command |
|---|---|---|
| Build gates | Regenerates both schedules from the fixture inputs and reconciles every derived value. Checks en-CA/fr-CA dictionary parity (keys, array lengths, placeholders). Rejects stale narration (script hash), raw-HTML APIs, network APIs, `eval`, speech synthesis, ElevenLabs endpoints/keys, unexpected absolute URLs, remote scripts/fonts, and the widget snippet appearing anything other than exactly once. | `node tools/build.mjs` |
| Smoke | Every route × EN/FR × 320/390/768/1024/1440 px: horizontal overflow (`scrollWidth ≤ clientWidth` plus per-element offenders), missing dictionary keys, console errors, unexpected requests | `node tests/smoke.mjs` |
| Module tests | 10 Playwright suites (shell, overview, changes, payments, notice, support, help, media, clair, query/insights) with about 1,300 assertions | `node tests/run-modules.mjs` |
| Acceptance | PRD §18 AC-01…AC-24 mapped to automated checks; manual remainder flagged | `node tests/acceptance.mjs` |
| Independent QA sweep | Seven lenses (PRD §1–9, PRD §10–19, financial accuracy, Canadian French, accessibility, visual/responsive, interaction/state), then verify-then-fix by owner area | multi-agent workflow |

**Browsers:** Chromium 141.0.7390.37 (Playwright 1.56.1, headless, Linux). Edge, Firefox, Safari, iOS Safari and Android Chrome were **not available** in this build environment (no network to install them; the environment forbids downloading browsers). Those runs remain to be done (§5).

## 2. Results

_Filled in at the end of the run._

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

1. **AC-11 voices (blocked on inputs).** Both narrations use the ElevenLabs premade voice "Sarah" with `eleven_multilingual_v2`. The available key could synthesise speech but could not list or audition voices. A **Canadian French accent is not established** and the English accent is not verified as Canadian. Four fr-CA auditions are in `docs/audio-auditions/`. To fix: supply approved voice IDs, update `src/content/narration.json` and run `tools/generate-voiceover.mjs`.
2. **Narration script wording.** The audio uses the PRD draft scripts verbatim, as the PRD requires. The QA sweep suggested a more idiomatic fr-CA line for chapter 2 (« vos remboursements de capital de novembre, décembre et janvier sont reportés »). Changing it requires script approval and re-synthesis.
3. **Canadian French copy.** All fr-CA copy is implementation input. A qualified Canadian French reviewer should sign it off using `docs/content/content-review.csv` (side-by-side, with a notes column).
4. **Accessibility widget (AC-19).** The supplied snippet is included exactly once. Its host (`accessibilityserver.org`) is blocked from this environment, so the vendor launcher's bottom-left placement, its resource origins and its data handling could not be observed. The app reserves bottom-left space and keeps its own launcher bottom-right. Verify online, and confirm placement in the vendor account configuration.
5. **External links.** The four PRD-verified BDC destinations and the learning-resource pair (seasonal-business cash-flow article, EN/FR) were confirmed through search-engine indexes only, because bdc.ca is blocked from this environment. Re-check them during content approval.
6. **Manual accessibility review (AC-21).** axe-core reports 0 WCAG 2.x A/AA violations across sections and overlays, and keyboard flows are scripted. A screen-reader pass (NVDA/JAWS/VoiceOver/TalkBack) and a real-device on-screen-keyboard test (AC-09) are still required.
7. **Brand approval.** The supplied logo is embedded unaltered (1280×680 WebP, aspect preserved). Colours and type follow the supplied brief and still need BDC brand approval. The workshop image is a labelled original SVG illustration; no stock photography is used.
8. **Not production.** There is no authentication, no server-side record and no live BDC integration. Clair is a local, rule-based demo, and query/survey/review events stay in memory. These boundaries are stated in the UI.
