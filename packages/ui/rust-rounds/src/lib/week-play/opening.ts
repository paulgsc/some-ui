/**
 * The week's opening on the phone (#3269, part 2): which take of each
 * question is in place, and the take home plays, as plain data. The pages
 * (`components/rust-week/opening`) show one question a page, and
 * `./runtime` asks home and plays.
 *
 * - **What's in place is home's to say** (C736; the S21 reinstall, #3281
 *   and #3292, lost exactly a phone's memory of it): home's record of the
 *   week names, for each question, the newest kept take under the week's
 *   version, from this week or an earlier one (`HomeOpening`). Until home
 *   answers, a question with no take said this week is "not known yet",
 *   never a guess from what this phone remembers.
 * - **A take said this week outranks an older record** (C784) until home
 *   holds it and has answered a read asked after: it is on this phone, and
 *   the newest home can name. Once home has judged it, home's record has the
 *   last word, and passes over a take it couldn't hear (the owner's call
 *   C785, #3304).
 * - **Nothing is let go here.** "Use this one" leaves home's take where it
 *   is; "Record again" adds a take, and the earlier stays on home.
 */
import type { PatternTake } from "@some-ui/voice-capture"
import { currentTakeOf } from "@some-ui/voice-capture"

import type { HomeWeekSent, OpeningSent } from "./spec"

/** One question's take as home's record names it. */
export type OpeningAtHome = {
  /** The question, from 1. */
  readonly n: number
  readonly take: string
  /** When it was recorded, ISO. */
  readonly recordedAt: string
  /** The week it was said in: `2026-w46`. */
  readonly week: string
  /** The version of the opening its words answer. */
  readonly version: number
  /** How long it runs, as the phone measured it; null when home doesn't say. */
  readonly ms: number | null
}

/** What home's record says of the week's opening, or nothing heard yet. */
export type HomeOpening =
  | { readonly kind: "unknown" }
  | {
      readonly kind: "known"
      readonly takes: ReadonlyArray<OpeningAtHome>
      /**
       * The takes home held as this phone asked (`./runtime` adds them):
       * its answer has judged each, so its record has the last word on
       * them (C785). A take still on its way home is not among them.
       */
      readonly judged?: ReadonlyArray<string>
    }

export const OPENING_UNKNOWN: HomeOpening = { kind: "unknown" }

/**
 * What home's own record of a week says (paulgsc/server
 * `GET /rust-weeks/:id/record`): what was sent (RR30) and the opening's
 * takes it plays (#3269), each unknown until home answers.
 */
export type HomeWeekRecord = {
  readonly sent: HomeWeekSent
  readonly opening: HomeOpening
}

/** A take of a question said this week, on this phone. */
export type OpeningHere = {
  readonly take: string
  readonly recordedAt: string
  readonly ms: number
}

/**
 * Take `take` of question `n` as a week sent carries it (C783), with how
 * long it runs in whole milliseconds, as home keeps it: the length its page
 * says too (the owner's ask, 2026-11-19: "from when and how long").
 */
export const openingTakeSent = (
  n: number,
  take: PatternTake,
  version: number
): OpeningSent => ({
  n,
  take: take.id,
  recordedAt: take.recordedAt,
  version,
  ms: Math.max(0, Math.round(take.durationMs)),
})

/** The take answering `line` now among `takes`, said this week; null for none. */
export function hereTake(
  takes: ReadonlyArray<PatternTake>,
  line: string
): OpeningHere | null {
  const take = currentTakeOf(takes, line)
  return take === null
    ? null
    : { take: take.id, recordedAt: take.recordedAt, ms: take.durationMs }
}

/** Where question `n`'s take stands, as its page says it. */
export type OpeningPlace =
  /** Home hasn't said, and none was said this week. */
  | { readonly kind: "unknown" }
  /** Home holds none under this version, and none was said this week. */
  | { readonly kind: "none" }
  /** Said this week, on this phone. */
  | ({ readonly kind: "here" } & OpeningHere)
  /** Home's, from this week or an earlier one: it plays from home. */
  | ({ readonly kind: "home" } & OpeningAtHome)

/**
 * Where question `n` of the opening at `version` stands: the take said here
 * this week, unless home's record names it or a newer one; else home's
 * take, or none, once home has said.
 */
export function openingPlace(
  n: number,
  version: number,
  home: HomeOpening,
  here: OpeningHere | null
): OpeningPlace {
  const atHome =
    home.kind === "known"
      ? (home.takes.find((each) => each.n === n && each.version === version) ??
        null)
      : null
  // Home held the take here when the phone asked: its record has the last
  // word, and passes over a take it couldn't hear (the owner's call C785,
  // #3304), so the page shows what it plays instead.
  const judged =
    here !== null &&
    home.kind === "known" &&
    (home.judged ?? []).includes(here.take)
  if (
    here !== null &&
    !judged &&
    (atHome === null ||
      (atHome.take !== here.take && atHome.recordedAt < here.recordedAt))
  ) {
    return { kind: "here", ...here }
  }
  if (atHome !== null) return { kind: "home", ...atHome }
  return home.kind === "known" ? { kind: "none" } : { kind: "unknown" }
}

/** Whether question `n`'s page has a take in place to use. */
export const inPlace = (place: OpeningPlace): boolean =>
  place.kind === "here" || place.kind === "home"
