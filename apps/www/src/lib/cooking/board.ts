/**
 * The Cooking page's board (C1117, C1160, C1161): which trains the list
 * shows and in what order, which page of them, whether the Show and Order
 * menu is open, which train's accordion is open, which train the card
 * follows, and each train's active stop (its current one until the owner
 * picks another). A pure step over the owner's taps; the component only
 * dispatches them and draws the state.
 *
 * - At most `TRAINS_MAX` trains, `TRAINS_PER_PAGE` to a page (C1118), policy
 *   in code. A run with more never grows the list; the page says so.
 * - Picking a stop anywhere (a train's line, the card's dots, the overview,
 *   the bar) makes it the card's, and moves the list to that train's page
 *   when the owner's filter shows it; it never changes the filter (C1161).
 */
import { assertNever } from "@some-ui/core-utils"
import type { Lands } from "@some-ui/video-render"
import { LANDS } from "@some-ui/video-render"

import type { Train } from "./model"
import { byId, bySince, hereOf, onYou } from "./model"

export const TRAINS_MAX = 12
export const TRAINS_PER_PAGE = 5

export type Filter = "all" | "you" | "moving" | Lands
export type Sort = "you-first" | "waiting" | "near"

export const FILTERS = [
  "all",
  "you",
  "moving",
  ...LANDS,
] as const satisfies ReadonlyArray<Filter>
export const SORTS = [
  "you-first",
  "waiting",
  "near",
] as const satisfies ReadonlyArray<Sort>

export type Board = {
  readonly filter: Filter
  readonly sort: Sort
  readonly page: number
  readonly menu: boolean
  /** The train whose accordion is open. */
  readonly open: string | null
  /** The train the card follows; `null` follows the most urgent. */
  readonly selected: string | null
  /** Each train's active stop, where the owner picked one. */
  readonly active: Readonly<Partial<Record<string, number>>>
}

export const INITIAL_BOARD: Board = {
  filter: "all",
  sort: "you-first",
  page: 0,
  menu: false,
  open: null,
  selected: null,
  active: {},
}

export type BoardEvent =
  | { readonly kind: "filtered"; readonly filter: Filter }
  | { readonly kind: "sorted"; readonly sort: Sort }
  | { readonly kind: "paged"; readonly page: number }
  | { readonly kind: "menu"; readonly open: boolean }
  | { readonly kind: "toggled"; readonly train: string }
  | { readonly kind: "picked"; readonly train: string; readonly stop: number }
  | { readonly kind: "slid"; readonly by: -1 | 1 }

export const matches = (filter: Filter, train: Train): boolean => {
  switch (filter) {
    case "all": {
      return true
    }
    case "you": {
      return onYou(train)
    }
    case "moving": {
      return !onYou(train)
    }
    case "home":
    case "phone":
    case "site":
    case "code": {
      return train.lands === filter
    }
    default: {
      return assertNever(filter)
    }
  }
}

const stopsLeft = (t: Train): number =>
  t.stops.filter((s) => s.state !== "passed").length
const sinceOf = (t: Train): string | null =>
  t.arrived ? null : hereOf(t).since

const ORDER: Record<Sort, (a: Train, b: Train) => number> = {
  "you-first": (a, b) =>
    Number(onYou(b)) - Number(onYou(a)) || bySince(sinceOf(a), sinceOf(b)),
  waiting: (a, b) => bySince(sinceOf(a), sinceOf(b)),
  near: (a, b) => stopsLeft(a) - stopsLeft(b),
}

/** Every train, ordered as the owner asked, up to the cap. */
export const ordered = (
  board: Board,
  trains: ReadonlyArray<Train>
): Array<Train> =>
  [...trains]
    .sort((a, b) => ORDER[board.sort](a, b) || byId(a, b))
    .slice(0, TRAINS_MAX)

/** The trains the list shows, filtered and ordered. */
export const shown = (
  board: Board,
  trains: ReadonlyArray<Train>
): Array<Train> =>
  ordered(board, trains).filter((t) => matches(board.filter, t))

export const pagesOf = (board: Board, trains: ReadonlyArray<Train>): number =>
  Math.max(1, Math.ceil(shown(board, trains).length / TRAINS_PER_PAGE))

/** The page the list is on, kept inside the pages there are. */
export const pageOf = (board: Board, trains: ReadonlyArray<Train>): number =>
  Math.min(Math.max(0, board.page), pagesOf(board, trains) - 1)

/** The train the card follows: the one picked, else `fallback`'s. */
export const selectedOf = (
  board: Board,
  trains: ReadonlyArray<Train>,
  fallback: string | null
): Train | null =>
  trains.find((t) => t.id === board.selected) ??
  trains.find((t) => t.id === fallback) ??
  trains.at(0) ??
  null

/** A train's active stop: the one picked, else where it stands. */
export const activeOf = (board: Board, train: Train): number => {
  const picked = board.active[train.id]
  return picked !== undefined && picked >= 0 && picked < train.stops.length
    ? picked
    : train.current
}

/** Whether the list is narrowed or reordered, so the menu's icon says so. */
export const narrowed = (board: Board): boolean =>
  board.filter !== INITIAL_BOARD.filter || board.sort !== INITIAL_BOARD.sort

/** The board after `event`; `fallback` is the train the card follows unpicked. */
export function stepBoard(
  board: Board,
  event: BoardEvent,
  trains: ReadonlyArray<Train>,
  fallback: string | null
): Board {
  switch (event.kind) {
    case "filtered": {
      return { ...board, filter: event.filter, page: 0, menu: false }
    }
    case "sorted": {
      return { ...board, sort: event.sort, page: 0, menu: false }
    }
    case "paged": {
      return {
        ...board,
        page: Math.min(Math.max(0, event.page), pagesOf(board, trains) - 1),
      }
    }
    case "menu": {
      return { ...board, menu: event.open }
    }
    case "toggled": {
      return {
        ...board,
        open: board.open === event.train ? null : event.train,
        selected: event.train,
      }
    }
    case "picked": {
      const train = trains.find((t) => t.id === event.train)
      if (
        train === undefined ||
        event.stop < 0 ||
        event.stop >= train.stops.length
      )
        return board
      const next: Board = {
        ...board,
        selected: train.id,
        open: train.id,
        active: { ...board.active, [train.id]: event.stop },
      }
      const at = shown(next, trains).findIndex((t) => t.id === train.id)
      return at === -1
        ? next
        : { ...next, page: Math.floor(at / TRAINS_PER_PAGE) }
    }
    case "slid": {
      const train = selectedOf(board, trains, fallback)
      if (train === null) return board
      const stop = Math.min(
        train.stops.length - 1,
        Math.max(0, activeOf(board, train) + event.by)
      )
      return {
        ...board,
        selected: train.id,
        active: { ...board.active, [train.id]: stop },
      }
    }
    default: {
      return assertNever(event)
    }
  }
}
