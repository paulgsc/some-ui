/**
 * Everything a walkthrough says and burns in about real use (WALK5, #3337;
 * #3338), in one table, in the viewer's terms: what was finished, left
 * part-way or never opened, and over what time. No count under 5 is said
 * (the engagement report's rule, ask #2701): it is "fewer than 5". Drawn
 * notes split their lines on "|", as every walkthrough scene's words do.
 */

import type { Silent } from "@some-ui/engagement"
import type { PublicCount } from "@some-ui/video-render"

import type { StopFriction } from "./walkthrough"

/** The most silent modules a card names by name; the rest are counted. */
const NAMED_MOST = 4

export const WALKTHROUGH_WORDS = {
  window: { drawn: "Last 4 weeks", said: "In the last four weeks" },
  notMeasured: {
    drawn: "Not measured yet",
    said: "How this stop is used isn't measured yet.",
  },
  nothingKept: {
    drawn: "Nothing kept yet",
    said: "Nothing of this stop is kept yet.",
  },
  count: (n: Exclude<PublicCount, "no-data">): string =>
    n === "fewer-than-5" ? "fewer than 5" : String(n),
  finished: {
    drawn: (n: string): string => `Finished ${n} times`,
    said: (n: string): string => `it was finished ${n} times`,
  },
  leftPartWay: {
    drawn: (n: string): string => `Left part-way ${n}`,
    said: (n: string): string => `left part-way ${n} times`,
  },
  time: {
    drawn: (s: number): string =>
      s < 90
        ? `About ${String(s)} s here`
        : `About ${String(Math.round(s / 60))} min here`,
    said: (s: number): string =>
      s < 90
        ? `about ${String(s)} seconds a visit`
        : `about ${String(Math.round(s / 60))} minutes a visit`,
  },
  silence: {
    title: "Not opened|lately",
    none: {
      drawn: "Every module|was opened",
      said: "Every module that is measured was opened in the last four weeks.",
    },
    quiet: (
      name: string,
      weeks: number | null
    ): { drawn: string; said: string } =>
      weeks === null
        ? { drawn: `${name}: never`, said: `${name}, never` }
        : {
            drawn: `${name}: ${String(weeks)} weeks`,
            said: `${name}, for ${String(weeks)} weeks`,
          },
    more: (n: number): string => `and ${String(n)} more`,
    lead: "Not opened in the last four weeks:",
    notMeasured: {
      drawn: (n: number): string => `${String(n)} not measured`,
      said: (n: number): string =>
        `${String(n)} more ${n === 1 ? "isn't" : "aren't"} measured, so ${n === 1 ? "it" : "they"} can't be called quiet.`,
    },
  },
} as const

const W = WALKTHROUGH_WORDS

/** The counts of a measured stop that home holds, as words. */
function parts(f: Extract<StopFriction, { kind: "measured" }>): {
  readonly finished: string | null
  readonly left: string | null
  readonly seconds: number | null
} {
  const { finished, leftPartWay, medianMs } = f.counts
  return {
    finished: finished === "no-data" ? null : W.count(finished),
    left: leftPartWay === "no-data" ? null : W.count(leftPartWay),
    seconds: typeof medianMs === "number" ? Math.round(medianMs / 1000) : null,
  }
}

/** What real use shows of a stop, burned in on its card. */
export function frictionNotes(f: StopFriction): string {
  if (f.kind === "not-measured") return W.notMeasured.drawn
  const { finished, left, seconds } = parts(f)
  if (finished === null && left === null && seconds === null)
    return W.nothingKept.drawn
  return [
    W.window.drawn,
    ...(finished === null ? [] : [W.finished.drawn(finished)]),
    ...(left === null ? [] : [W.leftPartWay.drawn(left)]),
    ...(seconds === null ? [] : [W.time.drawn(seconds)]),
  ].join("|")
}

/** What real use shows of a stop, said over its card. */
export function frictionSaid(f: StopFriction): string {
  if (f.kind === "not-measured") return W.notMeasured.said
  const { finished, left, seconds } = parts(f)
  const said = [
    ...(finished === null ? [] : [W.finished.said(finished)]),
    ...(left === null ? [] : [W.leftPartWay.said(left)]),
    ...(seconds === null ? [] : [W.time.said(seconds)]),
  ]
  return said.length === 0
    ? W.nothingKept.said
    : `${W.window.said}, ${said.join(", ")}.`
}

type Named = Silent & { readonly name: string }

/** The modules nobody opens, burned in on the silence card. */
export function silenceNotes(
  silent: ReadonlyArray<Named>,
  notMeasured: number
): string {
  const named = silent.slice(0, NAMED_MOST)
  const rest = silent.length - named.length
  return [
    ...(silent.length === 0
      ? [W.silence.none.drawn]
      : named.map((s) => W.silence.quiet(s.name, s.weeksQuiet).drawn)),
    ...(rest > 0 ? [W.silence.more(rest)] : []),
    ...(notMeasured > 0 ? [W.silence.notMeasured.drawn(notMeasured)] : []),
  ].join("|")
}

/** The modules nobody opens, said: every one by name. */
export function silenceSaid(
  silent: ReadonlyArray<Named>,
  notMeasured: number
): string {
  const lead =
    silent.length === 0
      ? W.silence.none.said
      : `${W.silence.lead} ${silent.map((s) => W.silence.quiet(s.name, s.weeksQuiet).said).join("; ")}.`
  return notMeasured > 0
    ? `${lead} ${W.silence.notMeasured.said(notMeasured)}`
    : lead
}
