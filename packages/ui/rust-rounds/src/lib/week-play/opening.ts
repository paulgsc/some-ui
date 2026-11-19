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
 * - **A take said this week outranks an older record** (C784): it is on
 *   this phone, and once sent it is the newest home can name, so home's
 *   resolver plays it. One home's record already names is home's.
 * - **Nothing is let go here.** "Use this one" leaves home's take where it
 *   is; "Record again" adds a take, and the earlier stays on home.
 * - **One take plays at a time** (`stepPlayback`): asked of home, then
 *   playing, or missed when home couldn't give it now; a late answer to an
 *   earlier ask plays nothing.
 */
import { assertNever } from "@some-ui/core-utils"
import type { PatternTake } from "@some-ui/voice-capture"
import { currentTakeOf } from "@some-ui/voice-capture"

import type { HomeWeekSent } from "./spec"

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
  | { readonly kind: "known"; readonly takes: ReadonlyArray<OpeningAtHome> }

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
 * How long take `id` among `takes` runs, in ms, as this phone measured it:
 * the length its page and home's record say (the owner's ask, 2026-11-19:
 * "from when and how long"); null for a take this phone doesn't list.
 */
export const takeMs = (
  takes: ReadonlyArray<PatternTake>,
  id: string
): number | null => takes.find((take) => take.id === id)?.durationMs ?? null

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
  if (
    here !== null &&
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

/** The take from home playing, or being asked for. */
export type Playback =
  | { readonly kind: "idle" }
  | { readonly kind: "asking"; readonly take: string }
  | { readonly kind: "playing"; readonly take: string }
  /** Home couldn't give it now: the page says so, and offers Play again. */
  | { readonly kind: "missed"; readonly take: string }

export const NOT_PLAYING: Playback = { kind: "idle" }

export type PlaybackEvent =
  | { readonly type: "play"; readonly take: string }
  /** Home answered the ask for `take`: its audio, or none. */
  | {
      readonly type: "answered"
      readonly take: string
      readonly found: boolean
    }
  | { readonly type: "ended"; readonly take: string }
  | { readonly type: "stop" }

/**
 * The next playback. An answer or an end for a take no longer asked for or
 * playing changes nothing, so a late one never plays over a newer ask.
 */
export function stepPlayback(state: Playback, event: PlaybackEvent): Playback {
  switch (event.type) {
    case "play": {
      return { kind: "asking", take: event.take }
    }
    case "answered": {
      if (state.kind !== "asking" || state.take !== event.take) return state
      return event.found
        ? { kind: "playing", take: event.take }
        : { kind: "missed", take: event.take }
    }
    case "ended": {
      return state.kind === "playing" && state.take === event.take
        ? NOT_PLAYING
        : state
    }
    case "stop": {
      return NOT_PLAYING
    }
    default: {
      return assertNever(event)
    }
  }
}
