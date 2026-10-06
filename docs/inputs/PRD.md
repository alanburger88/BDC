# BDC Important Financing Notice
## Product requirements document: self-contained bilingual SPA

**Version:** 1.0 | **Date:** 6 October 2026  
**Purpose:** First-discovery demonstration of the InfoSlips communication experience  
**Experience:** A loan change that an entrepreneur can understand, investigate and act on  
**Proposed assistant name:** Clair  
**Locales:** English (Canada), `en-CA`; French (Canada), `fr-CA`

## 1. Product vision and delivery contract

Build a polished, self-contained single-page application (SPA) that turns an important financing notice into a guided, interactive experience. It must answer four questions immediately: **What changed? What does it mean? What stays the same? What should I do next?**

This is a functional demonstration, not a marketing landing page, a series of static screenshots, or one long scrolling document. Tabs, financial comparisons, chart selections, help, questions, survey feedback and media controls must work.

The final recipient-facing deliverable is **one `index.html` file** containing the application code, styling, synthetic notice data, approved demonstration copy, graphics, supplied BDC logo and both pre-generated voiceovers. It must open directly in a browser without installing software, running a development server or supplying credentials.

**ElevenLabs is used only during creation.** Generate the English and Canadian French narration before packaging. Embed the resulting audio and timing data. Opening the notice, pressing Play, switching languages, replaying scenes or using the assistant must never call ElevenLabs.

The explicitly requested accessibility widget is the one automatic external-service exception. The core SPA must continue to work when offline or when that widget is blocked. BDC resource links may open externally only after a deliberate user action.

The assistant and service-request journey are interactive, clearly labelled local demonstrations. A static file is not a secure banking portal, a live model endpoint or a connection to BDC. Do not show a fake login, claim a query was sent to BDC, or call a local event an auditable production record.

### Product and evidence boundaries

The design draws on InfoSlips' source-described interactive records, contextual inquiry, approved language variants, embedded delivery and optional Acorn.Insight. Availability and production deployment remain subject to scope, configuration, integration and validation. “Clair” is a proposed customer-facing demo name, not a new InfoSlips module or an existing BDC assistant. [1]

BDC's published Client Space supports repayment schedules, balances, principal-postponement requests, confidential document exchange and controlled shared access. This makes the chosen communication relevant; it does **not** establish the hypothetical terms below as BDC policy. [3]

## 2. Scenario, personas and business purpose

### Demonstration scenario

**Camille Roy**, the fictional owner of **Atelier Boréal Inc.**, an established Canadian manufacturer, has requested a temporary principal postponement to manage a planned seasonal inventory build. The synthetic amendment is already approved and completed. This notice explains the resulting repayment changes.

Show a persistent, unobtrusive banner in both languages:

**EN:** “Concept demonstration • Fictional client and financing terms • Not connected to BDC.”  
**FR:** “Démonstration conceptuelle • Clientèle et modalités fictives • Aucun lien avec les systèmes de BDC.”

A smaller note beside the numbers states: “Illustrative financing schedule, not a BDC offer.” The French equivalent is “Calendrier de financement illustratif, et non une offre de BDC.”

Do not infer distress, protected characteristics or actual eligibility from the fictional name, location or language. The seasonal business need is explicitly supplied in the fixture, not derived by AI.

### Personas and outcomes

| Persona | Primary need | Experience outcome |
|---|---|---|
| Camille, business owner | Understand the change without reading a dense letter first | Find the next payment, relief period, cost and required action quickly |
| Authorised finance manager or accountant | Check the numbers and dates | Reconcile original/revised schedules and export useful data |
| BDC relationship/service team, represented only in the demo | Understand the question without repeatedly asking for context | Receive a preview of a structured inquiry tied to the selected notice item |
| BDC digital, operations and governance evaluators | Assess usefulness and implementation discipline | See bilingual, accessible, measurable interaction without false production claims |

The showcase should demonstrate customer understanding, contextual support, reduced repetition and responsible product discovery. It must not present an assumed percentage reduction in calls or an invented return on investment.

## 3. Canonical synthetic financing fixture

All views, narrative scripts, charts, assistant answers, exports and notices must use this one fixture. Store money as integer cents. Preserve dates as ISO calendar dates and format them without timezone-induced date shifts.

### Issued change

| Field | Required fixture value |
|---|---|
| Notice identifier | `DEMO-BDC-CHANGE-2026-001` |
| Client and company | Camille Roy; Atelier Boréal Inc. |
| Loan identifier | `DEMO-4821` |
| Notice issue date | 6 October 2026 |
| Amendment status | Approved and completed in this fictional scenario |
| Effective date | 1 November 2026 |
| Principal used at the start of the illustrated revised schedule | CAD 240,000.00 |
| Demonstration fixed annual rate | 8.00%, unchanged |
| Original monthly principal instalment | CAD 4,000.00, plus interest |
| Principal postponement | November 2026, December 2026 and January 2027 |
| Interest during postponement | CAD 1,600.00 each month, paid monthly |
| Principal repayments resume | 28 February 2027 |
| Original final payment | 31 October 2031 |
| Revised final payment | 31 January 2032 |
| Change fee | CAD 0.00 in this fixture |
| Customer acceptance required in this notice | No |
| Payment processing | None in the SPA |

The schedule starts on 1 November 2026. It illustrates future payments from that date; it does not attempt to reconstruct prior loan history or interest before that period. Assume month-end payments, no business-day adjustment, no new advances, no extra repayments and no capitalised interest. These are simulation assumptions, not actual BDC servicing conventions.

### First four payment comparisons

| Payment date | Original principal | Original interest | Original total | Revised principal | Revised interest | Revised total |
|---|---:|---:|---:|---:|---:|---:|
| 30 Nov 2026 | 4,000.00 | 1,600.00 | 5,600.00 | 0.00 | 1,600.00 | 1,600.00 |
| 31 Dec 2026 | 4,000.00 | 1,573.33 | 5,573.33 | 0.00 | 1,600.00 | 1,600.00 |
| 31 Jan 2027 | 4,000.00 | 1,546.67 | 5,546.67 | 0.00 | 1,600.00 | 1,600.00 |
| 28 Feb 2027 | 4,000.00 | 1,520.00 | 5,520.00 | 4,000.00 | 1,600.00 | 5,600.00 |

Amounts are CAD. This wide table is a build reference only: the mobile app must render these comparisons as stacked month cards, not a horizontally scrolling table.

### Required explanations and reconciliations

**Principal deferred:** CAD 12,000.00. It remains owing.

**Payment reduction over November–January:** CAD 11,920.00. Original payments total CAD 16,720.00; revised payments total CAD 4,800.00.

**Why not CAD 12,000.00 of payment relief?** The unreduced principal produces CAD 80.00 more interest within those three months than the original schedule. Therefore 12,000.00 minus 80.00 equals 11,920.00.

**Total interest over each complete remaining schedule:** original CAD 48,800.00; revised CAD 53,600.00; additional CAD 4,800.00.

**Total remaining payments:** original CAD 288,800.00; revised CAD 293,600.00.

The CAD 80.00 is already part of the CAD 4,800.00 lifetime increase. Never add it again. Do not describe deferred principal or reduced near-term payments as debt forgiveness, permanent savings or an interest-free holiday.

At creation time, generate and freeze the original 60-payment schedule and revised 63-payment schedule. For each row: interest equals opening principal multiplied by 0.08 / 12, rounded half-up to cents; total equals principal payment plus interest; closing principal equals opening principal minus principal payment. The original principal payment is 4,000.00 each month. The revised schedule has three zero-principal rows followed by sixty 4,000.00 principal rows.

The SPA presents approved fixture values. It is not a loan origination engine, a contractual interest calculator or a system that changes financing terms. No “what-if” control may silently alter the issued scenario.

## 4. Information architecture and progressive discovery

Use six sections, with one active section visible at a time. Do not append hidden sections below the active one.

| Route | English tab | Canadian French tab | Purpose |
|---|---|---|---|
| `#/overview` | Overview | Aperçu | Personal greeting, essential change, video and immediate action |
| `#/changes` | What changed | Ce qui change | Before/after comparisons, unchanged terms and explanations |
| `#/payments` | Payments & impact | Versements et incidence | Schedules, payment comparisons, cash-flow effect and total cost |
| `#/documents` | Your notice | Votre avis | Formal synthetic notice, amendment summary and downloads |
| `#/support` | Support for you | Du soutien pour vous | Relevant BDC advice, financing discovery and resources |
| `#/help` | Help & questions | Aide et questions | FAQ, glossary, local inquiry and three-face survey |

Clair is a persistent right-side assistant, not a seventh tab.

### Three levels of discovery

**Level 1: Understand.** Present a short conclusion and essential figures. The reader must not need to open a chart to discover additional interest or a later final payment.

**Level 2: Explore.** Selecting a card, month, chart mark or comparison row reveals the breakdown, definition and related explanation.

**Level 3: Act or verify.** From the detail, open the exact formal-notice section, request a contextual explanation, prepare a question or export the relevant schedule.

Example journey: select “CAD 11,920 less paid over three months” → see month-by-month differences → select December → inspect principal and interest → choose “Explain with AI” → open the relevant notice clause from Clair → return to the December card with state intact.

Use breadcrumbs or a clear “Back to…” control for detail views. Preserve the selected month, filter, scroll position and originating control when returning. Use hash routes for local-file compatibility; browser Back/Forward should restore meaningful navigation without a full reload. Route parameters may contain section and item identifiers, never names, financial amounts or question text.

## 5. Layout, navigation and mobile behaviour

### Desktop and tablet

The header contains the supplied BDC logo, notice descriptor, English/Français toggle and a quiet demo label. Below it, show the six tabs only where all labels fit at readable sizes. Use a content width of approximately 1,180 pixels with balanced whitespace and two-column cards where useful.

The right-side Clair panel overlays the document rather than squeezing financial cards into an unusable narrow column. Target 420 pixels wide on desktop. Use a single overlay manager: an inquiry panel, glossary dialog and assistant must not create nested focus traps.

### Mobile and constrained-width layout

Replace the horizontal tab bar with a full-width **“Sections: Overview”** button. It opens a vertical list or sheet containing all six destinations. Display the active destination with a checkmark and text; close the selector after selection. Do not use horizontally scrolling tabs, swipe carousels or an icon-only menu.

At narrow widths, all comparisons become labelled stacked cards. Use a single-column layout, vertical milestones, wrapped controls and charts designed for the available width. Long French labels and financial values must wrap safely. Never require sideways movement to find data, legends, buttons or content.

Support 320, 360, 390, 768, 1,024 and 1,440 CSS-pixel widths. Switch to the mobile section selector whenever the full navigation no longer fits, rather than shrinking labels.

The assistant slides in from the right and becomes a full-width dialog on mobile, with a visible title, Close button and safe-area-aware input. Opening the on-screen keyboard must not hide the send control or cause the body to scroll sideways.

Use `min-width: 0` on grid/flex children, responsive media sizing and robust word wrapping. Do not “fix” overflow by clipping the body with `overflow-x: hidden`; inspect and correct the offending component.

Keyboard tabs must follow the standard tab pattern on desktop. The collapsed mobile selector is a disclosure containing ordinary navigation controls. Maintain a clear visible focus indicator. Reflow and keyboard behaviour should be tested against W3C guidance; the target is a usable implementation, not an untested conformance claim. [8][9]

## 6. BDC brand and visual direction

Apply the supplied **BDC brand.txt** as the design brief. It is not a substitute for final BDC brand approval. The BDC logo will be supplied during implementation; embed it without redrawing, recolouring or stretching it. Before it is supplied, use a labelled placeholder, not an invented logo. [2]

| Token | Value | Application |
|---|---|---|
| Slate navy | `#182C3D` | Hero panel, media stage, headings and footer |
| BDC red | `#E01A22` | Primary actions and limited headline accents |
| Deep red | `#BD1219` | Hover and pressed states |
| White | `#FFFFFF` | Main surface and text on dark panels |
| Cool grey | `#F4F5F7` | Background and secondary cards |
| Body charcoal | `#222222` | Reading text |
| Muted grey | `#5B6770` | Secondary labels and metadata, subject to contrast testing |
| Electric blue | `#2B59FF` | Insight highlights and selected visual accents |

Use a local system stack such as `"Helvetica Neue", Arial, sans-serif`. Do not load remote fonts. Use sentence-case headings, 500–700 weight, compact headline spacing, 16-pixel body text and comfortable line height. Primary buttons are red with white text, pill-shaped and clearly labelled. Cards use 12–16-pixel radii, generous padding and restrained shadows.

Keep the tone helpful and institutional, not promotional or alarmist. Use brand red for actions rather than making every financial change appear dangerous. Show old/new values with labels and patterns as well as colour.

Use one supplied or licensed, locally embedded image of an authentic manufacturing workplace where available. A labelled illustration is an acceptable alternative. Do not portray a stock subject as the real recipient or as a BDC employee. Use inline SVG for financial diagrams and the handshake motif. Any supplied asterisk artwork may be used decoratively; do not approximate the official mark.

No decorative animation may delay access to the notice, conceal costs or interfere with reduced-motion preferences.


## 7. Core screens and interaction requirements

### Overview: a human welcome, then the facts

Open with a small animated handshake beside **“Hello, Camille. Let’s walk through your financing update.”** French: **“Bonjour Camille. Faisons le point sur la modification de votre financement.”**

The handshake is a tasteful one-time motion lasting approximately one second, not a forced introductory screen. Under reduced motion, show a static handshake. Treat the decorative icon as hidden from assistive technology; the greeting remains readable text.

The headline is **“Your principal payments are postponed for three months.”** French: **“Vos remboursements de capital sont reportés de trois mois.”**

Immediately show four cards: next payment CAD 1,600 on 30 November; principal resumes 28 February; CAD 11,920 less paid in November–January; CAD 4,800 additional interest across the remaining schedule. Place the later final-payment date and “principal remains owing” beside the summary, not behind an optional disclosure.

Primary CTA: **“See what changes” / “Voir ce qui change.”** Secondary CTA: **“Watch your personalised explanation” / “Voir votre explication personnalisée.”** Keep “Ask a question” visible but secondary.

Show a “What you need to do” card: review the updated schedule and update internal cash-flow planning. In this scenario no acceptance is required through the notice. Optional “Mark as reviewed” records only a local demo event, not contractual acceptance or proof of comprehension.

### What changed: compare, understand and verify

Use before/after cards for principal payments, interest, next payment, maturity and fees. Changed fields receive a clear textual badge; unchanged fields state “Unchanged.” Explain why the temporary payment reduction is not a reduction in debt.

Every material card has three contextual routes: “See the detail,” “Explain with AI” and “Ask about this.” The interest card also links to the total-cost comparison. The maturity card links to the full schedule. Formal wording remains accessible through “View this in your notice.”

### Payments & impact: explore without losing context

Provide a paired payment chart for November through April and a separate principal-balance chart across the remaining term. Avoid dual axes. Show axes, units, periods, direct labels and original/revised legends. Each chart must have an equivalent text summary and accessible data view.

Selecting a month reveals opening balance, principal, interest, total payment and closing balance for both schedules. Selecting a mark on mobile uses tap; all functions are available through keyboard controls and month cards.

Provide filters for “First three months,” “First six months” and “Full remaining term.” A full schedule uses pagination or grouped years, not sixty-three expanded mobile cards by default. Allow download of the displayed selection and the full revised schedule as CSV.

Show a cash-flow infographic: CAD 12,000 principal deferred minus CAD 80 additional interest within the first three months equals CAD 11,920 lower payments. A separate infographic shows the CAD 4,800 total additional interest. Do not put these two measures on an unlabeled common scale.

### Your notice: the formal reference

Include a readable synthetic notice, issued identifier, issue/effective dates, relevant amendment summary, revised schedule and a clear assumptions section. Make it easy to move from a plain-language explanation to its formal supporting paragraph.

Provide **“Print / Save as PDF”** through a dedicated print layout. The print view contains the notice, record metadata and relevant schedule, not the assistant conversation, survey, menus or optional marketing cards. Browser-generated PDF is a convenience output, not a claimed certified archival format.

### Support and help

Support contains restrained, relevant BDC resource cards. Help contains searchable FAQs, the glossary, the query form, the snap survey and a clear route back to the notice. Neither should become a long collection of unrelated links.

## 8. Personalised animated explanation with creation-time ElevenLabs audio

### Required experience

Create an animation that **looks and behaves like a video**, using HTML/SVG/CSS scenes synchronised to a bundled audio track. It does not have to be encoded as an MP4. Provide a poster, Play/Pause, replay, elapsed/total time, a seek bar, chapter selection, mute/volume, playback speed, captions and a transcript.

Do not autoplay sound. Use a 16:9 media stage on desktop and a reflowed mobile composition that keeps text legible; do not simply scale tiny desktop labels down. Fullscreen is optional and must have a fallback.

### Creation pipeline, never a runtime service

1. Freeze the synthetic notice data and the English and Canadian French narration scripts.
2. Review facts, financial language, pronunciation and both language versions.
3. Select licensed voices appropriate for Canadian English and Canadian French. Audition the actual samples; French-language support alone does not establish a Canadian accent.
4. Call ElevenLabs from a trusted authoring machine or build environment using a restricted secret held in an environment variable.
5. Save the returned audio and alignment information. Inspect the narration and build language-specific chapter/caption cues.
6. Embed both audio assets and both cue manifests in `index.html`, then discard any API credentials from distribution outputs.
7. Test playback, seeking and switching languages with all network access disabled.

ElevenLabs documents a text-to-speech endpoint that returns `audio_base64` and character timing. Its documented model default is `eleven_multilingual_v2`; this model does not support the `language_code` parameter. Use the approved-language script and selected voice, and confirm the chosen model at build time. [6]

Creation-only request shape:

```text
POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps
     ?output_format=mp3_44100_128

Headers:
  xi-api-key: value read from ELEVENLABS_API_KEY at build time
  Content-Type: application/json

Body:
  text: reviewed script for the selected locale
  model_id: confirmed supported model
```

There must be **no ElevenLabs SDK, key, token, proxy call, streaming connection or synthesis fallback in the delivered SPA**. Do not use browser speech synthesis as an unannounced replacement. ElevenLabs explicitly states that API keys must not be exposed in client-side code. [7]

If authorised creation-time API access or voice assets are missing, flag the audio deliverable as blocked. A silent prototype can be reviewed, but it does not pass the final bilingual-media acceptance test.

### Storyboard

| Scene | Visual treatment | Information and user value |
|---|---|---|
| 1. A personal welcome | Handshake, Camille’s name and company; gentle reveal | Establish whose notice this is and what it explains |
| 2. Three months of breathing room | November, December and January calendar cards; principal portion recedes, interest remains | Show the exact period and CAD 1,600 monthly payments |
| 3. Where the difference comes from | Labelled principal/interest blocks and the CAD 11,920 payment comparison | Distinguish deferred principal from cash-flow effect |
| 4. The trade-off | Three-month maturity shift and CAD 4,800 additional-interest card | Keep total cost visible, not just the near-term benefit |
| 5. Returning to principal payments | February card and CAD 5,600 first resumed payment | Make the next transition predictable |
| 6. Your next step | Schedule, “Explain with AI,” and “Ask a question” controls | Move from explanation into the actual document |

No scene may imply that a video click approves a financial amendment or makes a payment.

### English narration draft

“Hello Camille. Here is the financing update for Atelier Boréal.

In this example, your principal payments are postponed for November, December and January. You will still pay one thousand six hundred dollars in interest each month.

Twelve thousand dollars of principal is moved to later in the schedule. Your payments over these three months are eleven thousand nine hundred and twenty dollars lower than before. That is temporary cash-flow relief, not debt forgiveness.

There is a trade-off. Interest continues to accrue, and the revised schedule adds four thousand eight hundred dollars in interest over the remaining term. Your final payment moves to January thirty-first, twenty thirty-two.

Principal payments resume on February twenty-eighth, twenty twenty-seven. That month’s total payment is five thousand six hundred dollars.

Review the revised schedule, explore any amount, or ask Clair for an explanation. You can also prepare a question for your representative. No acceptance is required through this notice.”

### Canadian French narration draft

“Bonjour Camille. Voici la modification du financement d’Atelier Boréal.

Dans cet exemple, vos remboursements de capital sont reportés pour novembre, décembre et janvier. Vous continuerez de payer mille six cents dollars d’intérêts chaque mois.

Douze mille dollars de capital seront remboursés plus tard. Au total, vos versements de ces trois mois diminuent de onze mille neuf cent vingt dollars. Il s’agit d’un allègement temporaire de trésorerie, et non d’une remise de dette.

Il y a une contrepartie. Les intérêts continuent de courir, et le calendrier révisé ajoute quatre mille huit cents dollars d’intérêts sur la durée restante. Votre dernier versement est reporté au trente et un janvier deux mille trente-deux.

Les remboursements de capital reprennent le vingt-huit février deux mille vingt-sept. Le versement total de ce mois sera de cinq mille six cents dollars.

Consultez le calendrier révisé, explorez un montant ou demandez une explication à Clair. Vous pouvez aussi préparer une question pour votre personne-ressource. Aucune acceptation n’est requise dans cet avis.”

These are draft scripts for review, not approved BDC communications. Final audio must use the approved script exactly, with spoken amounts checked against the fixture.

### Synchronisation and language switching

Use the audio element’s `currentTime` as the playback clock. Derive visible scenes and captions from timestamped cues; do not run an unrelated timer that drifts after pause, seek or speed changes. Use an animation frame only to render the state corresponding to the audio clock.

On language change, pause playback, select the new embedded audio, map to the beginning of the equivalent semantic chapter and remain paused. English and French will have different durations; do not reuse an English timestamp in the French track.

Reduced-motion mode replaces animated transitions with stable scene changes while keeping the explanation and controls. The complete transcript must remain readable when audio fails. An audio error shows a clear message; it must never trigger a runtime API request.

## 9. Clair: in-document assistance from the right

### Name, role and presentation

**Clair — Your financing guide**  
**Clair — Votre guide du financement**

Clair is the proposed interface name for a document-scoped assistant experience aligned with Acorn.Insight. It explains this notice and points to supporting sections; it does not act as a general financial adviser. [1]

The launcher sits at the bottom right, separated from the accessibility launcher at bottom left. The assistant is closed on initial load. Opening it slides a panel in from the right. Include its name, demo status, Close button, current-context chip, suggested questions, response area and text input.

For the standalone build, implement local, bilingual, intent-based answers over the frozen notice and FAQ dataset. State visibly: **“Demo assistant • Answers from this sample notice • No live AI connection.”** It must accept typed questions, handle common paraphrases and fall back honestly when unsupported. Do not make a scripted lookup look like a verified live Acorn integration.

A future live Acorn.Insight implementation would be separately scoped with authenticated access, approved context, model/provider controls and testing. It is not a hidden dependency of this one-file demo.

### “Explain with AI” throughout the notice

Place this control beside the payment change, principal postponement, cash-flow difference, additional interest, maturity date, selected schedule row, unchanged rate and relevant formal-notice paragraph. Do not put it after every sentence.

Clicking it opens Clair with context such as section, selected field or row, comparison period, locale and notice version. The answer should provide a short explanation, one supporting fact, an internal source link and an optional “Ask a person” action.

Example: at the CAD 11,920 card, Clair explains that CAD 12,000 principal is delayed, CAD 80 more interest is paid within those months, and the net payment reduction is CAD 11,920. It also states that the principal remains owing.

### Required answer coverage and boundaries

Cover at least the following intents in both languages: what changed; effective date; next payment; postponement period; meaning of principal; continuing interest; why relief differs from deferred principal; total extra cost; new maturity; principal-resumption date; unchanged rate; fees; acceptance requirement; print/export; query preparation; and relevant support.

Every financial response must refer to fixture values or approved explanations, not fresh model arithmetic. Responses must distinguish the original schedule from the revised one.

For “Change my payment,” “Approve another postponement” or “Am I eligible for more funding?”, Clair explains its limits and routes to a contextual question. For unrelated questions, it says it can only help with the sample notice. It must not invent policy, a balance, an offer or an answer beyond its sources.

The panel must support Escape, focus containment while modal, return focus on close and a readable new-response announcement. It must never unexpectedly open, speak or submit a query.

## 10. Query capability: separate from the assistant

Provide **“Ask about this”** on change cards, schedule rows and formal-notice paragraphs, plus a general **“Ask a question”** route.

Open a local form containing the notice identifier, selected item, chosen language, topic and user-written question. Display captured context so the user can remove optional detail. Topics include payment amount, interest, maturity, understanding the change and other.

Allow a preferred contact method but do not ask for passwords, bank-account details, government identifiers or a real contact address in the public demo. Do not include attachment uploads or live email sending.

The flow is **Draft → Validate → Review → Create demo request**. Validation is inline and accessible; the question is required and limited to a reasonable length such as 1,000 characters. A review screen precedes confirmation.

Confirmation reads: **“Demo request created locally. Nothing has been sent to BDC.”** Show a reference prefixed `DEMO-`, a copyable summary and an optional JSON/text download. Opening a form is not recorded as submitting it.

Store query text in memory for the session, not in persistent browser storage by default. Closing the form preserves a draft during that session; resetting the demo clears it. An actual service integration and verified case acknowledgement belong to a separate production implementation.

## 11. Snap survey: three faces

Ask: **“How clear was this notice?”**  
French: **“Cet avis était-il clair?”**

Show three equally prominent, keyboard-operable faces: unhappy, neutral and happy. Pair them with explicit labels: **Not clear / Somewhat clear / Very clear** and **Pas clair / Assez clair / Très clair**. The icons must not be the only accessible names.

No option is preselected. Selecting a face records a local demo response and displays thanks. Allow changing the response. Unhappy or neutral responses may reveal an optional “What was unclear?” field and an offer of help, but never force a question or support interaction.

The survey is dismissible, does not block the notice and is not a Net Promoter Score measure. Store it separately from acknowledgement or customer understanding claims.

## 12. Jargon definitions, FAQ and help

Mark glossary terms consistently with a subtle underline and a proper button or focusable trigger. Desktop hover/focus can reveal a short definition; click pins the popover. Touch opens a dismissible popover or sheet. Escape closes it. Keep “Explain with AI” and “See in this notice” available where useful.

Do not rely on hover alone, a browser `title` attribute or unexplained acronyms.

| Term pair | Plain-language meaning to localise and review |
|---|---|
| Principal / Capital | The amount borrowed that remains to be repaid, excluding interest |
| Interest / Intérêts | The cost of borrowing, calculated using the balance and the applicable rate |
| Principal postponement / Report des remboursements de capital | Delaying principal payments; interest may still be payable |
| Instalment / Versement | A scheduled payment under the financing arrangement |
| Maturity date / Date d’échéance | The date the remaining loan balance is scheduled to be fully repaid |
| Outstanding principal / Capital restant à rembourser | Principal still owing at the relevant date |
| Fixed rate / Taux fixe | A rate that does not change during the specified fixed-rate period |
| Cash flow / Trésorerie | Money coming into and going out of the business |
| Amortisation / Amortissement | Repayment of principal over a schedule |
| Capitalised interest / Intérêts capitalisés | Interest added to the amount owing; this does not occur in the demo fixture |

Create searchable FAQ groups for “Understanding the change,” “Payments and cost,” and “Getting help.” Include answers to: Why was this notice issued? Do I still pay interest? Is the debt reduced? Why is relief CAD 11,920 rather than CAD 12,000? When do principal payments restart? Does the rate change? Is there a fee? Must I accept anything? Can my accountant review it? How do I ask a question?

Explain that the demo cannot grant actual accountant access. The help content may describe the intended authorised-user journey, consistent with BDC’s published controlled-sharing concept, without supplying fake access management. [3]


## 13. Accessibility/usability widget

Include the supplied script once, with normal JavaScript quotation marks and plain URLs:

```html
<script>
(function(d) {
  var s = d.createElement("script");
  s.setAttribute("data-account", "B3W9A2mgGs");
  s.setAttribute("src", "https://accessibilityserver.org/widget.js");
  (d.body || d.head).appendChild(s);
})(document);
</script>
<noscript>
  Please ensure Javascript is enabled for purposes of
  <a href="https://accessibilityserver.org">website accessibility</a>
</noscript>
```

Place the vendor’s launcher at the **bottom left**, using the provider’s supported configuration for the supplied account. Do not invent undocumented script attributes or create a second accessibility widget. Verify placement in the built app; the snippet by itself is not evidence that account positioning is configured.

Reserve space so the launcher does not cover controls, captions or mobile safe areas. The app’s native semantics, keyboard navigation, reflow and contrast must work independently of the widget. Loading the widget is not an accessibility certification.

The widget is an explicit online exception to the self-contained core. Review its required resource origins and data handling before any real customer use. Failure to load must not prevent the notice, audio, assistant simulation or query form from functioning.

## 14. Relevant BDC products and services

Show cross-sell as **helpful, optional support**, not an offer embedded in the formal amendment. Limit this tab to three cards and keep it out of the first-screen financial summary.

BDC’s current public information describes financial-management consulting, including cash-flow and working-capital management, and working-capital loans. Use the official English and French pages for approved product names and destination links. Do not imply eligibility, pre-approval or that these services solve every cash-flow problem. [4][5]

| Card | Why it is relevant to this fictional recipient | Suggested action |
|---|---|---|
| Financial management consulting / Consultation en gestion financière | The stated seasonal inventory plan makes cash-flow forecasting and working-capital planning relevant | “Discuss cash-flow planning” / “Discuter de votre planification de trésorerie” |
| Working Capital Loan / Prêt de fonds de roulement | Inventory and operating-cycle funding may merit a separate discussion after reviewing the existing financing | “Explore financing options” / “Explorer les options de financement” |
| BDC cash-flow learning resources | Education offers value without a credit commitment | “Explore resources” / “Explorer les ressources” |

The recommendation rationale comes from explicit fixture fields such as `seasonalInventoryBuild = true`, not the user’s survey mood, name, language, inferred identity or browsing behaviour.

The financial-management card appears first. The loan card states: **“Explore whether this fits your business. Subject to assessment and approval.”** No rate, maximum amount, instant-approval promise or personalised qualification should be fabricated. The resource card is educational, not represented as a lending product.

Each card has an in-app summary and a deliberate external link. The service/financing cards also allow a local inquiry with the selected topic prefilled. Dismissal is respected for the session. An unhappy clarity-survey response must not trigger a more aggressive sales offer.

For a hardship or arrears scenario, a configurable rule must suppress additional-borrowing promotion and prioritise help. That is a responsible demo rule, not a claimed BDC policy.

Verified destination configuration:

```text
Financial management, EN:
https://www.bdc.ca/en/consulting/financial-management
Financial management, FR:
https://www.bdc.ca/fr/consultation/gestion-financiere
Working capital, EN:
https://www.bdc.ca/en/financing/working-capital-loan
Working capital, FR:
https://www.bdc.ca/fr/financement/pret-fonds-roulement
```

Select and verify a specific bilingual learning-resource destination during content approval; do not ship a broken or guessed deep link.

## 15. Full English / Canadian French localisation

A visible **English | Français** control changes the entire experience: headings, tabs, notices, amounts, dates, charts, glossary, FAQ, validation, assistant responses, survey labels, captions, transcript and resource cards. Do not use flags as language selectors.

Set the document language to `en-CA` or `fr-CA`. Use locale-aware currency/date formatting. Both languages represent the same numeric data and record identifier; only presentation changes. Retain company and person names without unnecessary translation.

French copy must be written for Canada and reviewed by a qualified Canadian French reviewer. The draft French in this PRD is implementation input, not publication approval. Verify accented names, banking terminology and voice pronunciation.

On switching languages, preserve the current section, selected month, filters and local review state. Keep user-written text as typed, labelled with its original language; never silently translate a question already drafted. Assistant messages may remain in their original language while subsequent answers follow the selected locale.

Language variants and narration are prepared before distribution, consistent with the governed-language boundary in the InfoSlips knowledge base. Acorn.Lingo may assist preparation, but no live translation is needed or permitted to rewrite this issued demo. [1]

## 16. Self-contained technical architecture

### Packaging and implementation

Use vanilla HTML, CSS and JavaScript, or bundle any chosen framework into the delivered file. Do not require CDN libraries, remote fonts, external chart code, module fetching, a package install or a runtime build step.

Embed data as safely serialised JSON, icons and graphs as inline SVG, and permitted images as data URIs. Embed both narration tracks as audio data or create local Blob URLs from embedded bytes. Include captions, transcripts and cue data inline. Browser downloads use locally generated Blob objects.

The implementation source may have multiple files for maintainability, but the **recipient artifact is one HTML file**. Test it both by double-clicking through `file://` and by serving it from an ordinary static host.

Separate four models:

**IssuedRecord:** frozen data, notice version, effective date and schedules.  
**ApprovedContent:** language dictionaries, formal copy, definitions, scripts, FAQ and assistant answers.  
**ExperienceState:** active route, detail selection, filters, language and media position.  
**DemoEvents:** local review, query, survey and interaction events.

Changing experience state must not mutate the record. Freezing a JavaScript object is a demo safeguard, not cryptographic integrity or legal immutability.

### Minimum data contract

```json
{
  "noticeId": "DEMO-BDC-CHANGE-2026-001",
  "recordVersion": "1.0",
  "issueDate": "2026-10-06",
  "effectiveDate": "2026-11-01",
  "locale": "en-CA",
  "client": {
    "givenName": "Camille",
    "familyName": "Roy",
    "company": "Atelier Boréal Inc."
  },
  "loan": {
    "id": "DEMO-4821",
    "currency": "CAD",
    "principalAtScheduleStartCents": 24000000,
    "annualRateBasisPoints": 800,
    "monthlyPrincipalCents": 400000
  },
  "change": {
    "type": "principal_postponement",
    "months": 3,
    "acceptanceRequired": false,
    "originalMaturity": "2031-10-31",
    "revisedMaturity": "2032-01-31",
    "resumePrincipalDate": "2027-02-28"
  },
  "derived": {
    "principalDeferredCents": 1200000,
    "nearTermPaymentReductionCents": 1192000,
    "additionalLifetimeInterestCents": 480000
  }
}
```

Include the complete two schedules and all source-linked content in the actual build. Generate derived values at creation, validate them, then freeze them for the notice. The companion fixture provided with this PRD contains the reconciled schedules.

### Runtime dependency and privacy rules

The app may use the requested widget when online and deliberate BDC outbound links. It must not send notice data, audio requests, assistant prompts, query text or analytics to any other service. Do not include a live model connector, a generic chatbot endpoint or an analytics tracker by default.

A static file contains readable embedded information. Use fictional data only. No “secure” padlock or fabricated authentication screen may imply that the file provides production identity, encryption, access control or bank-grade confidentiality.

Escape user-entered text and render it as text, not HTML. Do not use `eval`, external user-provided URLs or query-string code. Scope persistent storage to non-sensitive preferences where available, with an in-memory fallback; never require localStorage for the notice to work.

### Failure and performance behaviour

Missing audio displays the transcript and a clear error; it never requests new speech. Missing imagery has a stable layout fallback. Unknown routes return to Overview. Unsupported assistant questions receive an honest fallback. Blocked widget requests do not interrupt rendering.

Aim for a final file below 10 MB and responsive interactions within 200 ms on the agreed test device; these are design targets, not product benchmarks. Defer audio decoding until needed, avoid heavy background animation and disclose any accepted size exception.

## 17. Demonstration insights and value measurement

Include a clearly labelled **“Demo insights”** view for the presenter, accessible without implying a genuine administrative security role. It shows local events only and offers Reset and Export.

Event types include `notice_opened`, `section_viewed`, `detail_opened`, `glossary_opened`, `explain_requested`, `video_started`, `video_chapter_viewed`, `video_completed`, `query_drafted`, `demo_query_created`, `survey_submitted`, `resource_opened`, `schedule_exported` and `language_changed`.

Log identifiers, locale and timestamps, not free-text questions or recipient names. Deduplicate repeated milestone events appropriately. Treat a request click, local request creation, actual server acceptance and completed service outcome as different concepts; only the first two exist here.

Do not present video completion as comprehension or “Mark as reviewed” as consent. Demo metrics are interaction counts, not measured BDC outcomes.

For later usability evaluation, test whether a participant can find the next payment, identify when principal resumes, explain that the principal remains owing and identify the additional total interest. A pilot could compare relevant contact reasons and task-completion measures against BDC’s own baseline; this PRD does not assign invented savings.

## 18. Acceptance criteria and release gates

All explicitly requested experience features are mandatory for the showcase. Optional extras must not displace them.

| ID | Test | Pass condition |
|---|---|---|
| AC-01 | One-file portability | `index.html` opens without installation or a development server; all core sections and assets work locally |
| AC-02 | Runtime network isolation | In a clean-session network trace, opening, playback, replay, language changes and assistant use produce zero ElevenLabs, model or telemetry requests |
| AC-03 | Offline operation | With network disabled, both voiceovers, all tabs, charts, definitions, local assistant and local query/survey flows work; widget failure is non-blocking |
| AC-04 | Financial consistency | Original/revised schedules match Section 3, sum to the specified totals and end at zero principal |
| AC-05 | Honest cost disclosure | Principal owed, extra lifetime interest and later maturity are visible without opening optional drill-downs |
| AC-06 | Progressive discovery | Card → month → explanation → formal clause → Back returns to the same context |
| AC-07 | Mobile navigation | All six sections appear in a vertical selector; there is no horizontally scrolling tab menu |
| AC-08 | No horizontal scrolling | All sections, dialogs and long French content fit at 320 CSS pixels; test `scrollWidth <= clientWidth` with a small rounding tolerance |
| AC-09 | Zoom and input | Content reflows at 400% desktop zoom; mobile keyboard does not hide query/assistant controls |
| AC-10 | Greeting | Personalised handshake greeting appears once and becomes static with reduced motion |
| AC-11 | Media quality | Actual creation-time ElevenLabs audio exists in both languages; pronunciation, amounts and dates are reviewed |
| AC-12 | Video-like behaviour | Pause, replay, seeking, speed, captions and semantic-chapter language switching stay synchronised |
| AC-13 | Right-side assistance | Clair opens from the right; mobile becomes a usable full-width dialog; contextual triggers pass the correct selected item |
| AC-14 | Assistant integrity | Seeded and paraphrased questions receive grounded answers; unsupported requests get a safe fallback; local simulation is labelled |
| AC-15 | Query integrity | Review precedes local confirmation; selected context is retained; confirmation explicitly says nothing was sent to BDC |
| AC-16 | Survey | Three labelled faces work with touch and keyboard; feedback is changeable, dismissible and never treated as NPS or consent |
| AC-17 | Jargon help | Definitions work by hover, focus and click/tap; users can dismiss and return to the original term |
| AC-18 | Language completeness | No missing dictionary keys, untranslated system messages, altered amounts or broken French layout |
| AC-19 | Widget | Supplied script appears once; vendor launcher is bottom left and does not cover controls |
| AC-20 | Cross-sell | At most three relevant cards; no fabricated eligibility; no hardship-triggered borrowing push; links open only by user choice |
| AC-21 | Accessibility | Meaningful headings, focus order, modal focus return, keyboard charts/cards, text alternatives and contrast checks pass manual review |
| AC-22 | Record/export alignment | CSV and print views reproduce the same approved data and carry the demo notice identity |
| AC-23 | Privacy and secrets | No real client data, API credentials, browser-side synthesis code or persistent free-text question storage |
| AC-24 | Brand/assets | Supplied logo is correctly embedded; no recreated logo, broken image, unlicensed photo or remote-font dependency |

Test in current desktop Chrome, Edge, Firefox and Safari, plus iOS Safari and Android Chrome. Record exact versions used at execution. Include a screen-reader review and keyboard-only walkthrough. An automated accessibility scan alone is not sufficient.

## 19. Implementation deliverables and approvals

The implementing team should deliver the single-file SPA, creation-time voiceover script/tool, the two reviewed audio masters and cue manifests, source project, data fixtures, content dictionary, and a concise QA report. Only the single HTML file is needed by the recipient; source/audio masters remain authoring assets.

Approval owners should cover financial fixture accuracy, English content, Canadian French content and voice pronunciation, brand/logo usage, accessibility, prototype engineering and information security. Actual BDC review is required before using its identity for external customer communication.

The supplied logo and authorised ElevenLabs creation credentials/voice selections are implementation inputs. Credentials must be provided through a secure build environment, never inserted into the PRD, browser application or distribution file.

No live BDC integration, production loan change, legal notice acceptance, payment, guarantee of compliance or automated financing decision is in scope. The product-owner review for future deployment must separately address identity, authorisation, issued-record retention, server-side evidence, subprocessors, accessibility validation and live service integrations.

### Showcase walkthrough

Open the notice and greet Camille. Review the relief and trade-off together. Play the personal explanation. Drill into December and ask Clair why the three-month payment reduction is not CAD 12,000. Jump to the supporting notice clause, then return. Switch to French and replay the equivalent chapter. Prepare a contextual question and show the honest local confirmation. Submit a clarity response, then explore the relevant financial-management support card. Repeat the essential journey on a narrow mobile viewport.

The final impression should be: **this is a clear, useful financing notice that happens to be interactive, not a collection of unrelated technology demonstrations.**

## 20. Sources and verification notes

**[1] InfoSlips Comprehensive Knowledge Base.md**, version 1.1, compiled 8 September 2026. Relevant sections: Source register and evidence status; Product identity; Document architecture; Capability reference; Acorn intelligence; Integration and architecture; Enterprise architecture and operations; Demonstration design; Claim controls and source reconciliation. Product descriptions are inherited/source-described, not independently tested in this PRD. No customer-specific proposal terms or prices are transferred.

**[2] BDC brand.txt**, supplied in this conversation. Used for colour, typography, components, tone and asset direction. Treat as the supplied design brief, with final brand approval still required.

**[3] BDC, “Client Space — Manage your account on your schedule.”** Reviewed 6 October 2026. Supports the contextual relevance of repayment schedules, principal-postponement requests, document exchange and delegated access.
`https://www.bdc.ca/en/about/what-we-do/client-space`

**[4] BDC, financial-management consulting, English and French.** Reviewed 6 October 2026. Supports the advisory-services discovery card; no case-study results or promised outcomes are used.
`https://www.bdc.ca/en/consulting/financial-management`
`https://www.bdc.ca/fr/consultation/gestion-financiere`

**[5] BDC, Working Capital Loan / Prêt de fonds de roulement.** Reviewed 6 October 2026. Supports the optional financing-discovery card, not eligibility for the fictional recipient.
`https://www.bdc.ca/en/financing/working-capital-loan`
`https://www.bdc.ca/fr/financement/pret-fonds-roulement`

**[6] ElevenLabs, “Create speech with timing.”** Reviewed 6 October 2026. Supports the creation-time endpoint, audio/timing output and model-parameter caveat. Recheck the selected model at implementation.
`https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps/`

**[7] ElevenLabs, “API Authentication.”** Reviewed 6 October 2026. Supports secret handling and server/build-side API use.
`https://elevenlabs.io/docs/api-reference/authentication`

**[8] W3C WAI, “Understanding Success Criterion 1.4.10: Reflow.”** Reviewed 6 October 2026. Reference for reflow testing.
`https://www.w3.org/WAI/WCAG22/Understanding/reflow.html`

**[9] W3C WAI, “Tabs Pattern.”** Reviewed 6 October 2026. Reference for desktop tab semantics and keyboard behaviour.
`https://www.w3.org/WAI/ARIA/apg/patterns/tabs/`

All scenario names, financing amounts, dates, assumptions, approval status, UI flows, demo metrics and assistant branding are proposed demonstration content. They do not describe an actual BDC client, agreement, workflow or technology deployment. The requested widget is supplied by the user; its account configuration and runtime behaviour require implementation testing.
