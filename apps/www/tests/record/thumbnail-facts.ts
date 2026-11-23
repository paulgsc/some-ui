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
 * - `call`: `week.json`, and which part from the folder's name, the
 *   episode's key on home (`<day>`, `<day>-p<k>`);
 * - `rust-essay`, `interview-essay`, `cards-essay`: `essay.json`, and for a
 *   cards essay the folder's name, its key;
 * - `report`: `report.json`;
 * - `playoff-delta`: the folder's name, the episode's key on home
 *   (`<season>-<TEAM>-<NN>`).
 *
 * A folder is read under the name home's worker gives it once the episode is
 * in place (paulgsc/server `infra/render/render-calls.sh`), which is its key,
 * not the name the recorder wrote it under.
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

/**
 * Which part of its week a call's episode is, from its key on home
 * (`<day>`, part 1; `<day>-p<k>`, part k: paulgsc/some-ui#2918), which names
 * its folder once home's worker has put it in place; or `null`.
 */
export function callPartOf(key: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return 1
  const later = /^\d{4}-\d{2}-\d{2}-p(\d+)$/.exec(key)
  return later === null ? null : Number(later[1])
}

/**
 * A Playoff Delta episode's season and week, from its key on home
 * (`<season>-<TEAM>-<NN>`, `2026-SF-08`; week 0 is the legend), which names
 * its folder once home's worker has put it in place; or `null`.
 */
export function playoffDeltaKeyOf(
  key: string
): { readonly season: string; readonly week: number } | null {
  const named = /^(\d{4})-[A-Za-z]+-(\d{2})$/.exec(key)
  if (named === null) return null
  const [, season = "", week = ""] = named
  return { season, week: Number(week) }
}

/** `root`'s `name` as JSON, or why it can't be read. */
export async function keptJson(
  root: string,
  name: string
): Promise<Parsed<unknown>> {
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
      const part = callPartOf(basename(root))
      if (part === null)
        return {
          ok: false,
          problems: [`${root} isn't named for a call's episode`],
        }
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
    const named = playoffDeltaKeyOf(basename(root))
    return Promise.resolve(
      named === null
        ? {
            ok: false,
            problems: [`${root} isn't named for a Playoff Delta episode`],
          }
        : { ok: true, value: playoffDeltaFacts(named.season, named.week) }
    )
  },
}
