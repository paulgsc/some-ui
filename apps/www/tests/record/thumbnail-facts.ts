/**
 * Each genre's thumbnail facts (C1026), one place for both ways a thumbnail
 * is made (C1300): by its recorder, from the input it was handed, and on its
 * own afterwards (`record:asset --asset thumbnail`, ASSETS-R), from what the
 * recorder kept in the episode's folder beside its video. A recorder calls
 * its genre's function here, so the two ways can't name an episode
 * differently.
 *
 * What each genre's folder keeps, and its facts are read from:
 *
 * - `call`: `week.json`, and the folder `part-<k>` for a week of parts;
 * - `rust-essay`, `interview-essay`, `cards-essay`: `essay.json`, and for a
 *   cards essay the folder's name, its key;
 * - `report`: `report.json`;
 * - `playoff-delta`: the folder's name, `<season>-week-NN`.
 */

import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { kindOf } from "@some-ui/playoff-delta/recording"
import type { Genre } from "@some-ui/styles/brand/genres"
import {
  callParts,
  parseCallWeek,
  parseCardsEssay,
  parseEssay,
  parseInterviewEssay,
  parseReport,
} from "@some-ui/video-render"
import type {
  CallWeek,
  Essay,
  InterviewEssay,
  Parsed,
} from "@some-ui/video-render"
import type { ThumbnailFacts } from "@some-ui/video-render/thumbnail"

/** The call's week, and which part of how many. */
export const callFacts = (
  week: CallWeek,
  part: number,
  of: number
): ThumbnailFacts<"call"> => ({
  genre: "call",
  from: week.week.from,
  to: week.week.to,
  part,
  of,
})

/** A Rust Rounds essay's week and its first ticket's title. */
export const rustEssayFacts = (essay: Essay): ThumbnailFacts<"rust-essay"> => ({
  genre: "rust-essay",
  week: essay.week.id,
  firstTicket: essay.tickets.at(0)?.title ?? null,
})

/** The role an interview essay's week was for. */
export const interviewEssayFacts = (
  essay: InterviewEssay
): ThumbnailFacts<"interview-essay"> => ({
  genre: "interview-essay",
  role: essay.role.title,
})

/** A cards essay's own title. */
export const cardsEssayFacts = (essay: {
  readonly title: string
}): ThumbnailFacts<"cards-essay"> => ({
  genre: "cards-essay",
  title: essay.title,
})

/** The ISO week a report covers. */
export const reportFacts = (report: {
  readonly week: string
}): ThumbnailFacts<"report"> => ({ genre: "report", week: report.week })

/** A Playoff Delta episode's season, and its week or the legend. */
export const playoffDeltaFacts = (
  season: string,
  week: number
): ThumbnailFacts<"playoff-delta"> => ({
  genre: "playoff-delta",
  season,
  week: kindOf(week) === "legend" ? "legend" : week,
})

/** A Playoff Delta episode's folder: `<season>-week-NN`. */
const PD_FOLDER = /^(.+)-week-(\d+)$/

/** A call part's folder: `part-<k>`, inside its week's. */
const PART_FOLDER = /^part-(\d+)$/

/** `root`'s `name` as JSON, or why it can't be read. */
async function keptJson(root: string, name: string): Promise<Parsed<unknown>> {
  try {
    const value: unknown = JSON.parse(await readFile(join(root, name), "utf8"))
    return { ok: true, value }
  } catch {
    return { ok: false, problems: [`${name} can't be read in ${root}`] }
  }
}

/** `read`'s value through `then`, or its problems. */
const thenOf = <A, B>(read: Parsed<A>, then: (a: A) => Parsed<B>): Parsed<B> =>
  read.ok ? then(read.value) : read

/**
 * Each genre's facts, from what its recorder kept in `root`, the episode's
 * folder; a genre added to `Genre` fails to compile until it is here.
 */
export const FACTS_FROM_FOLDER: {
  readonly [G in Genre]: (root: string) => Promise<Parsed<ThumbnailFacts<G>>>
} = {
  call: async (root) =>
    thenOf(thenOf(await keptJson(root, "week.json"), parseCallWeek), (week) => {
      const of = callParts(week).length
      const named = PART_FOLDER.exec(basename(root))
      const part = named === null ? 1 : Number(named[1])
      return part >= 1 && part <= of
        ? { ok: true, value: callFacts(week, part, of) }
        : {
            ok: false,
            problems: [
              `${root} is part ${String(part)}, and its week has ${String(of)}`,
            ],
          }
    }),
  "rust-essay": async (root) =>
    thenOf(thenOf(await keptJson(root, "essay.json"), parseEssay), (essay) => ({
      ok: true,
      value: rustEssayFacts(essay),
    })),
  "interview-essay": async (root) =>
    thenOf(
      thenOf(await keptJson(root, "essay.json"), parseInterviewEssay),
      (essay) => ({ ok: true, value: interviewEssayFacts(essay) })
    ),
  "cards-essay": async (root) =>
    thenOf(
      thenOf(await keptJson(root, "essay.json"), (raw) =>
        parseCardsEssay(basename(root), raw)
      ),
      (essay) => ({ ok: true, value: cardsEssayFacts(essay) })
    ),
  report: async (root) =>
    thenOf(
      thenOf(await keptJson(root, "report.json"), parseReport),
      (report) => ({ ok: true, value: reportFacts(report) })
    ),
  "playoff-delta": (root) => {
    const named = PD_FOLDER.exec(basename(root))
    return Promise.resolve(
      named?.[1] === undefined
        ? {
            ok: false,
            problems: [`${root} isn't a Playoff Delta episode's folder`],
          }
        : { ok: true, value: playoffDeltaFacts(named[1], Number(named[2])) }
    )
  },
}
