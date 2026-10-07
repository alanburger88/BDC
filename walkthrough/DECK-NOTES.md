# Corrections needed in the supplied deck

The walkthrough shows the deck's slides as images and its speaker notes word for word, so errors in the deck appear on screen. The build refuses edited notes, so fix these in the deck. Then re-run `tools/extract_deck.py` and `tools/build.mjs`.

## Wrong figures and dates (fix first)

| Slide | On the slide | Should be |
|---|---|---|
| 5 | Screenshot header: notice "BDC-CHG-2025-001" | BDC-CHG-2026-001, as on slides 11 and 12 and in the notice |
| 8 | Clair: "your revised payment is $1,800.00, interest only" | $1,600.00 (the slide's own supporting fact and its callout say $1,600) |
| 8 | Payment list: "November 31, 2026", "December 21, 2026" | November 30 and December 31 |
| 9 | Clair: the revised payment and its interest are both "$1,000.00" | $1,600.00 |
| 10 | Chart: the y-axis steps from $5,000 straight to $8,000 | $6,000 at the top |
| 10 | Chart: November original "$6,600"; January revised "$1,800" | $5,600; $1,600 |
| 11 | French screen: "EN VIGUEUR LE 1er NOVEMBRE 2035" | 2026 |

## Language errors

- **Slide 11, the bilingual slide**:
  - The callout repeats "with governed".
  - The French screen has "Versements ent incidence" for "Versements et incidence", "a aité approuve" for "a été approuvé", "pour vous versements" for "pour vos versements", and a garbled "Voici ce ve que cela".
- **Slide 5**:
  - "from from".
  - "Watch your personalized explanation", where the notice's button says "personalised".
- **Slide 8**: "See the brsakdown", "Decemker", and "pastponed" or "pestponed" in the status tags.
- **Slide 9**: "Ses in your notice".
- **Slide 10**: "Principal pestponed".
- **Slide 4**:
  - "plain-lang understanding".
  - "tradeoff", where slide 7 says "Trade-Off".
- **Slide 7**:
  - The February to April chart labels overlap and can't be read.
  - Both "cashflow" and "Cash-flow" appear.
- **Slides 2 and 13**: the AI-generated images have garbled text.
  - Slide 2: "DOCUMEITS & DAYA REPOSITORY".
  - Slide 13: "inveotory", "ADVIEORY SERVICE", "FINANEING", "seperels", "entreprensurs".
  - A real capture of the notice's Support for you section would fix slide 13.

Re-capturing the screenshots and charts on slides 5, 7, 8, 9, 10, 11 and 13 from the live notice would correct most of the items above in one pass.

## Claims the deck's own notes walk back

The walkthrough shows the slide and the talk track together, so a reader sees both.

| Slide text | What the notes or the assessment say |
|---|---|
| Slide 4: "ensuring full legal compliance" | Slide 11 note: "The concept alone does not establish legal conformance." |
| Slide 9: "eliminating the need to leave the document or call the bank" | Slide 9 note: "Complex or unresolved questions would still require human support." |
| Slide 13: "Cross-Selling Opportunity" callout | The assessment says the proposition should not lead with cross-sell or revenue uplift. |
| Slide 14: "Deep telemetry on reading behavior" | Slide 16 note: "Access alone does not prove understanding." |
| Slide 15: "Strict plain language compliance", "Unparalleled accessible design", "Dramatically lower entrepreneur anxiety" | Slide 15 note: "Benefits should follow measured results rather than assumed savings or compliance guarantees." |

## Speaker note to reword

- **Slide 2**:
  - Current wording: "The supplied assessment cites 98% satisfaction with online financing in BDC's fiscal 2026 reporting".
  - The problem: this refers to InfoSlips' internal assessment, which a BDC reader won't recognise.
  - Suggested: "BDC's fiscal 2026 reporting cites 98% satisfaction with online financing."

## Spelling

- The deck uses US spellings: center, behavior, traveling.
- The deck uses "personalized", while the notice uses -ise forms: personalised, amortisation, capitalised.
- Canadian style generally pairs -ize with centre, behaviour and travelling. Choosing one style for the deck and the notice would make them consistent.
