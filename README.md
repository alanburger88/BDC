# BDC Important Financing Notice — interactive bilingual concept demo

> **Concept demonstration • Fictional client and financing terms • Not connected to BDC.**
> Camille Roy, Atelier Boréal Inc., loan `LN-4821` and every amount are synthetic. Nothing here is a BDC offer, agreement, policy or system.

A self-contained single-page application that turns an important financing notice (a three-month principal postponement) into a guided, interactive experience in English (Canada) and Canadian French. It answers four questions immediately: **What changed? What does it mean? What stays the same? What should I do next?**

## The deliverable

**[`dist/index.html`](dist/index.html)** is the recipient artifact: one file with the application code, styling, synthetic notice data, approved demo copy, graphics, the supplied BDC logo and both pre-generated voiceovers. Open it directly in a browser (double-click / `file://`) or serve it from any static host. No install, no server and no credentials are needed.

The only automatic online request is the supplied accessibility widget (`accessibilityserver.org`). The notice, narration, assistant simulation, query form and survey work fully offline and when the widget is blocked. BDC resource links open only when the user chooses them.

## What's inside

| Section | Route | Highlights |
|---|---|---|
| Overview | `#/overview` | Personal handshake greeting, headline, four key figures, later maturity and "principal remains owing" beside the summary, what you need to do, "Mark as reviewed" (local only), personalised video explanation |
| What changed | `#/changes` | Before/after cards with Changed/Unchanged badges, detail views, "Explain with AI", "Ask about this", "View this in your notice" |
| Payments & impact | `#/payments` | Paired payment chart (Nov–Apr), principal-balance chart, filters, month detail, grouped full schedule, cash-flow and total-cost infographics, CSV export |
| Your notice | `#/documents` | Formal synthetic notice (12 clauses), record metadata, revised schedule, assumptions, downloads, dedicated print / Save as PDF layout |
| Support for you | `#/support` | Three optional, relevant BDC resource cards (no eligibility claims; hardship rule) |
| Help & questions | `#/help` | Searchable FAQ, glossary, local query route, three-face clarity survey |
| Clair (right panel) | — | Document-scoped financing guide: bilingual, intent-based answers from this notice only ("Answers are based on this notice.") |
| Session insights (presenter) | `#/insights` | Unlinked presenter view of this tab's interaction events with Clear/Export |

## Recipient view

At the product owner's request (2026-10-06), the experience reads as the recipient would see it. The banner, the "DEMO" labels, the notes saying the data is fictional or illustrative, the demo wording in Clair, the question form and the survey, and the `DEMO-` identifiers are all removed. Identifiers are now `BDC-CHG-2026-001` (notice) and `LN-4821` (loan), and the narration no longer says "In this example". The build enforces this (`RECIPIENT_BANNED` in `tools/build.mjs`), and acceptance check RV-01 confirms it.

The honesty guardrails remain. The question form says "Request created … recorded with reference REQ-0001" and never claims BDC received the question. Clair says "Answers are based on this notice." No contacts, rates or policies are invented. The UserWay launcher sits bottom-left (`data-position` 5) so it doesn't collide with Clair at bottom-right. The data is still fictional: a non-visible HTML comment records this, and the page is not for real customer use.

## Project layout

```
dist/index.html              ← single-file deliverable (built)
src/                         source project (see docs/ARCHITECTURE.md)
  data/fixture.json          canonical synthetic fixture
  content/*.js               bilingual content dictionaries (approved-content model)
  content/narration.json     frozen narration scripts, voices and model
  assets/                    supplied logo, narration masters + cue manifests
  js/, styles/               application modules and design system
tools/
  fixture.mjs                regenerates and reconciles both schedules (60 / 63 rows)
  generate-voiceover.mjs     CREATION-TIME ElevenLabs synthesis + caption/chapter cues
  build.mjs                  inlines everything into dist/index.html; lint + i18n parity checks
  export-content.mjs         exports dictionaries + side-by-side CSV for language review
tests/                       Playwright QA (smoke, per-module, acceptance AC-01…AC-24)
docs/                        architecture, QA report, voiceover notes, content exports, inputs
```

## Commands

```bash
npm install                      # dev-only: axe-core for the accessibility scan
node tools/fixture.mjs           # validate the fixture and reconciliations
node tools/build.mjs             # build dist/index.html
node tests/smoke.mjs             # all routes × EN/FR × widths: overflow, missing keys, console, network
node tests/run-modules.mjs       # per-module interaction tests
node tests/acceptance.mjs        # PRD §18 acceptance checks (Chromium)
node tools/export-content.mjs    # dictionaries for French/English content review
```

### Regenerating the narration (creation time only)

```bash
ELEVENLABS_API_KEY=… node tools/generate-voiceover.mjs          # both locales
node tools/generate-voiceover.mjs --cues-only                   # rebuild cues from saved alignment
node tools/generate-voiceover.mjs --auditions                   # short fr-CA voice auditions
```

The key is read from the environment on a trusted build machine and is never written to any output. Voices: en-CA Sarah (premade), fr-CA Amélie (Voice Library, Quebec French). ElevenLabs' raw output is kept as `*.source.mp3`; the embedded copy is loudness-matched (−18 LUFS) when needed. Behind an authenticating proxy, run with `NODE_USE_ENV_PROXY=1`. The build refuses to package narration whose script, voice or model changed since synthesis. See [docs/VOICEOVER.md](docs/VOICEOVER.md).

## Status and approvals

See **[docs/QA-REPORT.md](docs/QA-REPORT.md)** for test results, browser coverage and items that need human review: Canadian French copy and voice, BDC brand approval, accessibility manual review, and the accessibility widget's placement.
