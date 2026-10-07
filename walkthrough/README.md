# InfoSlips for BDC: guided walkthrough

A responsive, self-guided executive walkthrough that takes a BDC stakeholder through the InfoSlips value proposition and into the live Financing Change Notice. It works on its own without a presenter, and it also supports a live sales conversation.

It is a static site: plain HTML, CSS and JavaScript, with no framework. The walkthrough itself makes no third-party requests. The embedded notice loads its accessibility widget from accessibilityserver.org, as it does on its own. The walkthrough uses the InfoSlips brand: Inter, white and slate surfaces, green accents and the InfoSlips logos, with a "Prepared for BDC" lockup. The BDC look appears inside the slides and the notice.

## The three parts

| Part | Steps | What it does |
|---|---|---|
| 1. Introduction | 2 | **Welcome:**<br>• the proposition<br>• the "not another portal" message<br>• the five value pillars: understandable, interactive, accessible, actionable, measurable<br><br>**How it works:** the three parts and the controls |
| 2. Presentation | 18 | One slide at a time from the supplied deck.<br><br>**Talk track:** each slide's speaker notes, word for word, grouped under *What to notice*, *Why it matters* and *Keep in mind*.<br><br>Slides with a live counterpart link to it. Every slide also has an enlarged view and a text version. |
| 3. Live statement | 12 + wrap-up | The real Financing Change Notice in a scaled Desktop, Tablet or Mobile frame.<br><br>**Guided stops:** each stop names a capability, suggests something to try, and has a **Show me in the notice** button that drives the notice: it changes the route, opens Clair, switches the language, highlights an element or changes the device.<br><br>**Wrap-up:** the next-step message. |

### Persistent controls

The following controls are available on every step:

- Back and Next. The arrow keys, Page Up and Page Down also work, so a presentation clicker can drive it.
- Progress: the part stepper, the step count and a "next up" line.
- Contents: jump to any step.
- Restart, with confirmation. It also resets the live notice.
- **Open live statement**: opens the notice in a new tab, at the section currently on screen.
- **Presentation / Live statement**: switches parts and remembers your place in each.
- **Desktop / Tablet / Mobile**: the simulated screen sizes are 1280 × 800, 768 × 1024 and 390 × 844. The frame is scaled to fit, so there is never horizontal page scrolling.

Your place is saved on the device in `localStorage`, and the URL hash names the step (`#/slides/7`, `#/live/clair`).

### When the notice can't be embedded

The notice is served from the same site, at `notice/index.html`, so it normally embeds. If a browser or proxy blocks it, if it times out, or if the files are opened from disk, the device frame shows a preview image of the notice instead. A prominent **Open live statement** action then opens it in a new tab, and **Show it here anyway** or **Try again** lets the visitor retry in the frame.

## Layout

```
walkthrough/
  DECK-NOTES.md           corrections needed in the supplied deck
  src/
    index.html            page shell, icon sprite, dialogs
    css/app.css           InfoSlips design system and responsive layouts
    js/app.js             steps, controls, slide and live views
    js/notice.js          hosts and drives the notice inside the device frame
    content/walkthrough.json   all copy: intro, slide titles and text, talk-track grouping, live stops
    content/deck.json     extracted from the deck: speaker notes (verbatim) and slide ratio
    assets/               slides (WebP), notice previews, logos, Inter (OFL)
  tools/
    extract_deck.py       creation time: deck (.pptx) to slide images and notes
    previews.mjs          creation time: notice screenshots for the loading and fallback frames
    build.mjs             validates content, lints, writes dist/ (adds the notice and _headers)
  tests/
    server.mjs            static server that applies dist/_headers like Netlify
    walkthrough.mjs       Playwright QA: layout at 16 screen sizes, controls, history, live stops, fallback, axe
```

## Commands

```bash
node tools/build.mjs                         # at the repository root: builds the notice (dist/index.html)
node walkthrough/tools/build.mjs             # builds walkthrough/dist (includes notice/index.html)
node walkthrough/tests/walkthrough.mjs       # QA in Chromium; writes tests/results/walkthrough.json

# creation time only, when the deck or the notice changes
python3 walkthrough/tools/extract_deck.py path/to/deck.pptx [--pdf deck.pdf]
node walkthrough/tools/previews.mjs
```

The build fails if:

- a talk track doesn't use every speaker-note sentence, once, in order;
- a slide is missing an image, alt text or slide text;
- a live stop is broken;
- the sources contain an external URL, an inline style or script, or a network call.

## Deployment

Always build, then deploy `dist/`: run `node walkthrough/tools/build.mjs`, then for example `netlify deploy --prod --dir walkthrough/dist`. A Git-linked Netlify site builds it through `netlify.toml`. The build stamps a hash of the sources into `js/content.js`, and the test suite fails on a `dist/` built from older sources. `_headers` sets the following:

- `noindex`, so the site is not listed by search engines;
- a strict Content-Security-Policy for the walkthrough;
- `X-Frame-Options: SAMEORIGIN` for the notice.

## Content notes

- The talk track is the deck's speaker notes, verbatim. The live-stop and introduction copy was written for the walkthrough from the deck, its notes and the BDC × InfoSlips assessment. It claims only what the notice demonstrably does.
- The notice uses a fictional entrepreneur and illustrative amounts. The walkthrough says so in "How it works", because the speaker notes say the same. The notice itself reads as the recipient would see it.
- In the demonstration, Clair's answers are prepared from the notice's content and no external AI service is used. The walkthrough says so at the Clair stop.

## QA status

`tests/walkthrough.mjs` runs in Chromium. It covers:

- all 33 steps, each opening from its own address;
- no horizontal scrolling at 16 screen sizes from 320 × 640 to 1920 × 1080, with the live view in all three devices;
- on one-screen layouts, intro and wrap-up content fits or fades at the bottom to show there is more;
- the persistent controls: Back and Next, the keyboard and clicker keys (also while the notice has focus), Contents, Restart, Open live statement, the Presentation / Live switch, the screen sizes and the part stepper;
- browser Back and Forward;
- the saved place;
- the enlarged slide;
- every live stop's **Show me** at each simulated device;
- the fallback when embedding is blocked;
- no CSP violations;
- an axe-core scan for WCAG 2.2 A/AA.

The latest results are in `tests/results/walkthrough.json`. An independent review covered:

- visual design and brand;
- usability against the brief;
- accessibility;
- content accuracy;
- code.

A second, adversarial pass then reproduced every finding on the original build and re-checked it on the final one. The findings were fixed in the walkthrough. Errors in the supplied deck itself (wrong figures in slide screenshots, typos, claims that the speaker notes walk back) are listed in [DECK-NOTES.md](DECK-NOTES.md), to be corrected in the deck.

Not yet done, and needs a person:

- screen-reader passes (NVDA, JAWS, VoiceOver);
- checks on real phones and tablets;
- Safari and Firefox;
- a live presentation rehearsal with the clicker that will be used.
