/**
 * The status page (#2165): every process this phone runs, how it last went,
 * and which need their person, in one place. Each row carries its own
 * surface's mark and words (`laneView`, `morningOf`, `lastLook`), never a
 * copy. This module orders them: a row that needs its person is lifted
 * into one group at the top, by a fixed rule on its mark (`needOf`), and
 * the rest stay in their context's group. Pure; its words are `./words`.
 */
import { assertNever } from "@some-ui/core-utils"

import type { LastRead } from "@/lib/home-link/routine-model"
import type { Morning } from "@/lib/jobs/morning"
import {
  morningSaid,
  morningSign,
  morningStop,
  morningTheme,
} from "@/lib/jobs/morning"
import type { JourneyTheme, Sign, Stop } from "@/lib/journey"
import type { How, Where } from "@/lib/sharing-marks"

import { BOARD_WORDS } from "./words"

/** What a row asks of its person, most first. */
export type Need = "you" | "watch" | "moving" | "fine" | "off"

const NEED_ORDER: ReadonlyArray<Need> = [
  "you",
  "watch",
  "moving",
  "fine",
  "off",
]

const GROUP_ORDER = ["home", "jobs", "korean"] as const

export type GroupId = (typeof GROUP_ORDER)[number]

/** Korean's look at the routine's files on home: its last look, or none. */
export type Look = "off" | "not-yet" | LastRead["kind"]

/** A row's mark, in its own surface's language. */
export type RowMark =
  | { readonly kind: "lane"; readonly where: Where; readonly how: How | null }
  | {
      readonly kind: "journey"
      readonly at: Stop
      readonly sign: Sign
      readonly theme: JourneyTheme
    }
  | { readonly kind: "look"; readonly look: Look }

/** The page that owns a row's process, where its row leads. */
export type BoardPage = "practice" | "aph" | "jobs" | "home-settings"

export type BoardRow = {
  /** Unique on the board. */
  readonly id: string
  readonly group: GroupId
  readonly name: string
  /** Beside the mark: its surface's word. */
  readonly word: string
  /** Its surface's sentence for how it stands. */
  readonly line: string
  /** More of its surface's sentences, each its own line. */
  readonly more: ReadonlyArray<string>
  readonly mark: RowMark
  readonly page: BoardPage
}

const LANE_NEEDS: Readonly<Record<How, Need>> = {
  current: "fine",
  waiting: "moving",
  sending: "moving",
  bringing: "moving",
  "no-answer": "watch",
  busy: "watch",
  forgotten: "you",
  unpaired: "you",
  full: "you",
  "no-room": "you",
  refused: "you",
  fault: "you",
  failed: "you",
}

const THEME_NEEDS: Readonly<Record<JourneyTheme, Need>> = {
  stopped: "you",
  waiting: "you",
  moving: "moving",
  read: "fine",
}

const LOOK_NEEDS: Readonly<Record<Look, Need>> = {
  read: "fine",
  busy: "watch",
  unreachable: "watch",
  forgotten: "you",
  failed: "you",
  "not-yet": "moving",
  off: "off",
}

/** What `mark` asks of its person: the one rule the board orders by. */
export function needOf(mark: RowMark): Need {
  switch (mark.kind) {
    case "lane": {
      if (mark.how !== null) return LANE_NEEDS[mark.how]
      // Kept, with its last send shown elsewhere: it says once seen.
      return mark.where === "checking" || mark.where === "kept"
        ? "moving"
        : "off"
    }
    case "journey": {
      return THEME_NEEDS[mark.theme]
    }
    case "look": {
      return LOOK_NEEDS[mark.look]
    }
    default: {
      return assertNever(mark)
    }
  }
}

/** The look a `LastRead` says, given whether Korean shows the files at all. */
export function lookOf(shown: boolean, last: LastRead | null): Look {
  if (!shown) return "off"
  return last === null ? "not-yet" : last.kind
}

/** This morning's jobs run (RUN1), as Today's card says it. */
export function morningRow(m: Morning, now: Date): BoardRow {
  const said = morningSaid(m, now)
  return {
    id: "morning",
    group: "jobs",
    name: BOARD_WORDS.morning,
    word: said.title,
    line: said.line,
    more: [],
    mark: {
      kind: "journey",
      at: morningStop(m.id),
      sign: morningSign(m.id),
      theme: morningTheme(m.id),
    },
    page: "jobs",
  }
}

export type Board = {
  /** Rows that need their person, most pressing first. */
  readonly needsYou: ReadonlyArray<BoardRow>
  /** The rest, by context, in `GROUP_ORDER`; a group with none is left out. */
  readonly groups: ReadonlyArray<{
    readonly id: GroupId
    readonly rows: ReadonlyArray<BoardRow>
  }>
}

/** `rows` on the board: the ones that need you lifted, the rest by context. */
export function boardOf(rows: ReadonlyArray<BoardRow>): Board {
  const needsYou = rows.filter((row) => needOf(row.mark) === "you")
  const rest = rows.filter((row) => needOf(row.mark) !== "you")
  return {
    needsYou,
    groups: GROUP_ORDER.flatMap((id) => {
      const inGroup = rest
        .filter((row) => row.group === id)
        .sort(
          (a, b) =>
            NEED_ORDER.indexOf(needOf(a.mark)) -
            NEED_ORDER.indexOf(needOf(b.mark))
        )
      return inGroup.length === 0 ? [] : [{ id, rows: inGroup }]
    }),
  }
}

/** Every row of `board`, in the order the page shows them: its glance. */
export function glanceOf(board: Board): ReadonlyArray<BoardRow> {
  return [...board.needsYou, ...board.groups.flatMap((group) => group.rows)]
}
