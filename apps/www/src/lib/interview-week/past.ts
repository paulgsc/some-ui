/**
 * Past weeks (IW17, paulgsc/some-ui#3226): every week this phone holds that
 * has closed, sent or not, newest first, each with where its essay stands. Pure: it reads the
 * weeks and sends this phone keeps, Studio's `interview-essay` feed as
 * `lib/call-videos` holds it, and home's render board (`lib/renders`), and
 * says what the page shows, so every status is held by its test.
 *
 * Where an essay stands, in order:
 * - **asking**, **unpaired** or **unknown**: the feed is being read, can't
 *   be read until this phone is paired, or couldn't be read; nothing more
 *   is said of the essay;
 * - **ready**: the feed has its video (on home, or out on YouTube);
 * - **making**: the feed lists it without a video yet, or the board is
 *   making it or has it waiting its turn;
 * - **failed**: the board says home couldn't finish it;
 * - **expected**: closed, and nothing made yet. When the board says the
 *   next interview essay is coming on a day after the deadline, that day.
 */
import type { InterviewWeek } from "@some-ui/interview-week"

import type { Episode, ListState } from "@/lib/call-videos/model"
import { standing } from "@/lib/call-videos/model"
import type { Board } from "@/lib/renders/model"

import type { InterviewSent } from "./spec"
import { isClosed } from "./spec"
import type { HeldInterview } from "./store"

/** The feed whose episodes are the interview's essays. */
export const ESSAY_FEED = "interview-essay"

export type EssayStatus =
  | { readonly kind: "asking" | "unpaired" | "unknown" }
  /** Its page in Studio, by the key the feed names it. */
  | { readonly kind: "ready"; readonly key: string }
  | { readonly kind: "making" }
  | { readonly kind: "failed" }
  /** `on`: the day home expects to make it, `YYYY-MM-DD`, where it says. */
  | { readonly kind: "expected"; readonly on: string | null }

/** One week on the page. */
export type PastWeek = {
  readonly week: InterviewWeek
  /** The latest send made from this phone, or null when none was. */
  readonly sent: InterviewSent | null
  readonly essay: EssayStatus
}

/** The episodes the feed lists, or null while it hasn't been read. */
const episodesOf = (list: ListState): ReadonlyArray<Episode> | null =>
  list.kind === "read" ? list.episodes : null

type BoardRow = { readonly feed: string; readonly key: string }

/** Whether a board row is `week`'s essay. */
const names =
  (week: string) =>
  (row: BoardRow): boolean =>
    row.feed === ESSAY_FEED && row.key === week

/** Where a closed week's essay stands. */
export function essayOf(
  week: Pick<InterviewWeek, "id" | "due">,
  list: ListState,
  board: Board | null
): EssayStatus {
  if (list.kind === "reading") return { kind: "asking" }
  if (list.kind === "unpaired") return { kind: "unpaired" }
  const episodes = episodesOf(list)
  if (episodes === null) return { kind: "unknown" }
  const parts = episodes.filter(
    (episode) => (episode.week ?? episode.key) === week.id
  )
  const first = parts.at(0)
  if (
    first !== undefined &&
    parts.every((part) => standing(part) !== "waiting")
  )
    return { kind: "ready", key: first.key }
  const on = names(week.id)
  if (
    first !== undefined ||
    (board !== null &&
      ((board.now !== null && on(board.now)) || board.waiting.some(on)))
  )
    return { kind: "making" }
  if (board?.failed.some(on) === true) return { kind: "failed" }
  const coming = board?.coming.find(({ feed }) => feed === ESSAY_FEED)?.on
  return {
    kind: "expected",
    on: coming !== undefined && coming >= week.due.slice(0, 10) ? coming : null,
  }
}

/** Every week held that closed by `at`, newest first, each with its last send and its essay. */
export function pastWeeks(
  held: ReadonlyArray<HeldInterview>,
  sent: ReadonlyArray<InterviewSent>,
  at: string,
  list: ListState,
  board: Board | null
): ReadonlyArray<PastWeek> {
  return held
    .filter(({ week }) => isClosed(week, at))
    .sort((a, b) => b.week.opens.localeCompare(a.week.opens))
    .map(({ week }) => ({
      week,
      sent:
        sent
          .filter((record) => record.week === week.id)
          .sort((a, b) => b.at.localeCompare(a.at))
          .at(0) ?? null,
      essay: essayOf(week, list, board),
    }))
}
