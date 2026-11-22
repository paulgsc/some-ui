/**
 * Everything a walkthrough says and burns in about real use (WALK5, #3337;
 * #3338), in one table, in the viewer's terms and the owner's first person:
 * how often a step was reached and moved on from, how long a stretch on it
 * runs, how hard applying felt, and which modules nobody opens. No count
 * under 5 is said (the engagement report's rule, ask #2701): it is "fewer
 * than 5". Drawn notes split their lines on "|", as every walkthrough
 * scene's words do.
 */

import type { Silent } from "@some-ui/engagement"
import type { PublicCount } from "@some-ui/video-render"

import type { StopMeasure } from "./walkthrough"

/** The most silent modules a card names by name; the rest are counted. */
const NAMED_MOST = 4

/** The longest module name a card draws whole; a longer one is cut short. */
const NAME_CHARS = 16

type Shown = Exclude<PublicCount, "no-data">

export const WALKTHROUGH_WORDS = {
  window: { drawn: "Last 4 weeks", said: "In the last four weeks" },
  notMeasured: {
    drawn: "Not measured yet",
    said: "How I use this step isn't measured yet.",
  },
  nothingKept: {
    drawn: "Nothing kept yet",
    said: "Nothing of this step is kept yet.",
  },
  // Home read only part of the window (`partial`): a fact about the whole
  // read, not this step, so it says the count is unknown, never that the
  // step was used a lot.
  tooMuch: {
    drawn: "Not counted this time",
    said: "How often I used this step isn't counted this time.",
  },
  count: (n: Shown): string =>
    n === "fewer-than-5" ? "fewer than 5" : String(n),
  stretches: {
    drawn: (n: string): string => `Here ${n} times`,
    said: (n: string): string => `I spent time on this step ${n} times`,
  },
  movedOn: {
    drawn: (n: string): string => `Moved on ${n} times`,
    said: (n: string): string => `and moved on from it ${n} times`,
  },
  time: {
    drawn: (s: number): string =>
      s < 90
        ? `About ${String(s)} s a stretch`
        : `About ${String(Math.round(s / 60))} min a stretch`,
    said: (s: number): string =>
      s < 90
        ? `a stretch here runs about ${String(s)} seconds`
        : `a stretch here runs about ${String(Math.round(s / 60))} minutes`,
  },
  debrief: {
    drawn: (median: number | null, said: string): string =>
      median === null
        ? `Rated ${said} times`
        : `Felt ${String(median)} of 5 to apply`,
    said: (median: number | null, said: string): string =>
      median === null
        ? `I rated how hard applying felt ${said} times in these four weeks.`
        : `When I rate how hard an application felt, it comes to about ${String(median)} out of 5.`,
  },
  silence: {
    title: "Not opened|in four weeks",
    none: {
      drawn: "Every module|measured was opened",
      said: "Every module I measure was opened in the last four weeks.",
    },
    nothingMeasured: {
      drawn: "No module's opening|is measured yet",
      said: "Which modules I open isn't measured yet.",
    },
    quiet: (name: string): { drawn: string; said: string } => ({
      drawn: clipped(name),
      said: name,
    }),
    more: (n: number): string => `and ${String(n)} more`,
    lead: "Some of what I built, I haven't opened in the last four weeks:",
    notMeasured: {
      drawn: (n: number): string => `${String(n)} more not measured`,
      said: (n: number): string =>
        `How I use ${String(n)} other ${n === 1 ? "module" : "modules"} isn't measured yet.`,
    },
  },
} as const

const W = WALKTHROUGH_WORDS

/** `name` cut to fit a card's line. */
function clipped(name: string): string {
  return name.length <= NAME_CHARS
    ? name
    : `${name.slice(0, NAME_CHARS - 1).trimEnd()}…`
}

const shown = (n: PublicCount): string | null =>
  n === "no-data" ? null : W.count(n)

/** What one measure shows, drawn and said; null where it shows nothing to say. */
function wordsOf(
  m: StopMeasure,
  partial: boolean
): { readonly drawn: ReadonlyArray<string>; readonly said: string } | null {
  switch (m.kind) {
    case "not-measured": {
      return { drawn: [W.notMeasured.drawn], said: W.notMeasured.said }
    }
    case "place": {
      const stretches = shown(m.counts.stretchesLeft)
      if (stretches === null)
        return partial
          ? { drawn: [W.tooMuch.drawn], said: W.tooMuch.said }
          : { drawn: [W.nothingKept.drawn], said: W.nothingKept.said }
      const moved = shown(m.counts.movedOn)
      const { medianMs } = m.counts
      const seconds =
        medianMs === null || medianMs < 1000
          ? null
          : Math.round(medianMs / 1000)
      const said = [
        W.stretches.said(stretches),
        ...(moved === null ? [] : [W.movedOn.said(moved)]),
      ].join(" ")
      return {
        drawn: [
          W.stretches.drawn(stretches),
          ...(moved === null ? [] : [W.movedOn.drawn(moved)]),
          ...(seconds === null ? [] : [W.time.drawn(seconds)]),
        ],
        said: `${W.window.said}, ${said}${seconds === null ? "" : `; ${W.time.said(seconds)}`}.`,
      }
    }
    case "debrief": {
      const said = shown(m.said)
      if (said === null) return null
      return {
        drawn: [W.debrief.drawn(m.median, said)],
        said: W.debrief.said(m.median, said),
      }
    }
    default: {
      const none: never = m
      throw new TypeError(`an unknown measure: ${JSON.stringify(none)}`)
    }
  }
}

/** What real use shows of a stop, burned in on its card: "" where it shows nothing. */
export function measureNotes(
  measures: ReadonlyArray<StopMeasure>,
  partial = false
): string {
  const drawn = measures.flatMap((m) => wordsOf(m, partial)?.drawn ?? [])
  const measured = measures.some((m) => m.kind === "place")
  return drawn.length === 0
    ? ""
    : [...(measured ? [W.window.drawn] : []), ...drawn].join("|")
}

/** What real use shows of a stop, as lines said after its narration. */
export function measureSaid(
  measures: ReadonlyArray<StopMeasure>,
  partial = false
): ReadonlyArray<string> {
  return measures.flatMap((m) => {
    const words = wordsOf(m, partial)
    return words === null ? [] : [words.said]
  })
}

type Named = Pick<Silent, "pipeline"> & { readonly name: string }

/** What `modules` shows of silence: the quiet ones by name, and how many can't be told. */
export type Quiet = {
  readonly silent: ReadonlyArray<Named>
  readonly measured: number
  readonly notMeasured: number
}

/** The modules nobody opens, burned in on the silence card. */
export function silenceNotes(q: Quiet): string {
  if (q.measured === 0) return W.silence.nothingMeasured.drawn
  const named = q.silent.slice(0, NAMED_MOST)
  const rest = q.silent.length - named.length
  return [
    ...(q.silent.length === 0
      ? [W.silence.none.drawn]
      : named.map((s) => W.silence.quiet(s.name).drawn)),
    ...(rest > 0 ? [W.silence.more(rest)] : []),
    ...(q.notMeasured > 0 ? [W.silence.notMeasured.drawn(q.notMeasured)] : []),
  ].join("|")
}

/** The modules nobody opens, said: every one by name. */
export function silenceSaid(q: Quiet): string {
  if (q.measured === 0) return W.silence.nothingMeasured.said
  const lead =
    q.silent.length === 0
      ? W.silence.none.said
      : `${W.silence.lead} ${q.silent.map((s) => W.silence.quiet(s.name).said).join("; ")}.`
  return q.notMeasured > 0
    ? `${lead} ${W.silence.notMeasured.said(q.notMeasured)}`
    : lead
}
