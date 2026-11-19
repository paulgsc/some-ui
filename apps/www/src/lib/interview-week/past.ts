/**
 * Past weeks (IW17, paulgsc/some-ui#3226): every week this phone holds that
 * has closed, sent or not, newest first, each with where its essay stands. Pure: it reads the
 * weeks and sends this phone keeps, Studio's `interview-essay` feed as
 * `lib/call-videos` holds it, and home's render board (`lib/renders`), and
 * says what the page shows, so every status is held by its test.
 *
 * Where an essay stands, in order:
 * - **asking**, **unpaired**, **older** or **unknown**: the feed is being
 *   read, can't be read until this phone is paired, is one this home doesn't
 *   keep yet, or couldn't be read; nothing more is said of the essay;
 * - **ready**: Studio's Episodes shows its video, on home or out on YouTube
 *   (`lib/episodes-feed`'s `rowStatus`, as it stands);
 * - **failed**: home's render board says it couldn't finish it;
 * - **making**: the board is making it now;
 * - **waiting**: the board has it waiting its turn;
 * - **written**: the feed lists it, without its video yet, and the board
 *   names it nowhere (or couldn't be read);
 * - **expected**: closed, and home has no essay of it yet. Home promises no
 *   day for an interview essay (paulgsc/server `feeds/renders.rs`, `coming`),
 *   so none is said.
 */
import { assertNever } from "@some-ui/core-utils"
import type { InterviewWeek } from "@some-ui/interview-week"

import type { ListState } from "@/lib/call-videos/model"
import { rowsOf, rowStatus } from "@/lib/episodes-feed"
import type { Board } from "@/lib/renders/model"

import type { InterviewSent } from "./spec"
import { isClosed } from "./spec"
import type { HeldInterview } from "./store"

/** The feed whose episodes are the interview's essays. */
export const ESSAY_FEED = "interview-essay"

export type EssayStatus =
  | {
      readonly kind:
        | "asking"
        | "unpaired"
        | "older"
        | "unknown"
        | "failed"
        | "making"
        | "waiting"
        | "written"
        | "expected"
    }
  /** Its page in Studio, by the key the feed names it. */
  | { readonly kind: "ready"; readonly key: string }

/** One week on the page. */
export type PastWeek = {
  readonly week: InterviewWeek
  /** The latest send made from this phone, or null when none was. */
  readonly sent: InterviewSent | null
  readonly essay: EssayStatus
}

type BoardRow = { readonly feed: string; readonly key: string }

/** Whether a board row is `week`'s essay. */
const names =
  (week: string) =>
  (row: BoardRow): boolean =>
    row.feed === ESSAY_FEED && row.key === week

/** Where a closed week's essay stands. */
export function essayOf(
  week: Pick<InterviewWeek, "id">,
  list: ListState,
  board: Board | null
): EssayStatus {
  switch (list.kind) {
    case "reading": {
      return { kind: "asking" }
    }
    case "unpaired":
    case "older": {
      return { kind: list.kind }
    }
    case "away":
    case "busy":
    case "unreadable": {
      return { kind: "unknown" }
    }
    case "read": {
      break
    }
    default: {
      return assertNever(list)
    }
  }
  const row = rowsOf(ESSAY_FEED, list.episodes).find(
    (each) => each.week === week.id
  )
  if (row === undefined) return { kind: "expected" }
  if (rowStatus(row) !== "making")
    return { kind: "ready", key: row.parts[0].key }
  const on = names(week.id)
  if (board?.failed.some(on) === true) return { kind: "failed" }
  const now = board?.now ?? null
  if (now !== null && on(now)) return { kind: "making" }
  if (board?.waiting.some(on) === true) return { kind: "waiting" }
  return { kind: "written" }
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
