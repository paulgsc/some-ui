/**
 * The video the phone page's Studio fixtures open (`./fixtures.tsx`), and
 * the review render the sweep hands Watch (`../studio-fit.spec.ts`). One
 * module with no imports, so the page (bundled by Vite) and the spec (run
 * by Playwright in Node) agree on the title and the scenes without either
 * loading the other's world. The fixture checks the schema string against
 * `@some-ui/video-render`'s, so a renamed schema fails the build, not the
 * sweep.
 */

export const FIT_REVIEW_SCHEMA = "some-ui.studio-review/1"

/**
 * Written to fill the screens rather than to teach: a long title, a point
 * and a line as long as a cut's are written, three facts to keep, and a
 * scene of each voice.
 */
export const FIT_CUTS = [
  {
    id: "path",
    artifact: "The path card, with every pick of the week on it",
    point:
      "Following the model paid off this week, even where it looked wrong on Sunday morning",
    keep: [
      "3 of 4 picks hit",
      "The model said Detroit, and Detroit covered by a field goal",
      "The one miss was a line move after the pick was locked",
    ],
    targetSec: 20,
  },
  {
    id: "miss",
    artifact: "The miss",
    point: "The one miss, and why it stays in the record",
    line: "One pick missed, and here is why it stays in the record: the line moved after the pick was locked, and the model does not chase a line.",
    targetSec: 15,
  },
  {
    id: "next",
    artifact: "End card",
    point: "What week 9 tests",
    targetSec: 10,
  },
] as const

const FIT_TITLE = "Playoff Delta, week 8: three picks, one miss, one line move"

/** A version 2 primer, mixed voice: the second cut read word for word. */
export const FIT_PRIMER_TEXT = JSON.stringify({
  version: 2,
  title: FIT_TITLE,
  budgetSec: 120,
  voice: "mixed",
  cuts: FIT_CUTS,
})

/**
 * A review render of revision `rev` of that video: each scene after the
 * last, as long as its cut asks. Watch checks the title and the scenes'
 * ids against the version kept, not their lengths.
 */
export function fitReviewText(rev: number): string {
  let startMs = 0
  const shotTimes = FIT_CUTS.map((cut) => {
    const durationMs = cut.targetSec * 1_000
    const at = startMs
    startMs += durationMs
    return { id: cut.id, cut: null, startMs: at, durationMs }
  })
  return JSON.stringify({
    schema: FIT_REVIEW_SCHEMA,
    title: FIT_TITLE,
    rev,
    shotTimes,
  })
}
