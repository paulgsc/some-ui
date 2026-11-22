/**
 * The Asks pages (C1200, C1201), pure. Every ask has the same shared part whatever its kind (`AskFile`'s waits,
 * call and unblocks), so a list's rows and chips are one shape for every
 * kind; only the opened row is the kind's own. The views are the kinds and
 * the pivot, and `VIEW_PATHS` must name each: a new kind of ask fails to
 * compile here until it has an address, and with it a page and a nav entry.
 */
import { assertNever } from "@some-ui/core-utils"
import type { AskCall, AskFile, AskWaits } from "@some-ui/video-render"
import { ASK_CALLS, ASK_WAITS } from "@some-ui/video-render"
import { notFound } from "@tanstack/react-router"

import type { AskIssue } from "./model"
import { byQuestion } from "./model"

export type AskKind = AskFile["kind"]

/** A page under Asks: a kind's list, or the pivot of every kind. */
export type AskView = AskKind | "pivot"

export const VIEW_PATHS = {
  decision: "decisions",
  checklist: "checklists",
  pivot: "pivot",
} as const satisfies Record<AskView, string>

const isView = (key: string): key is AskView => key in VIEW_PATHS

/** The views, in the order the nav lists them. */
export const ASK_VIEWS: ReadonlyArray<AskView> =
  Object.keys(VIEW_PATHS).filter(isView)

export const ASK_KINDS: ReadonlyArray<AskKind> = ASK_VIEWS.filter(
  (view): view is AskKind => view !== "pivot"
)

/** The view whose address is `path`, or `null` when none has it. */
export const viewAt = (path: string): AskView | null =>
  ASK_VIEWS.find((view) => VIEW_PATHS[view] === path) ?? null

/** How the view route reads and writes its address: unknown is not found. */
export const viewParams = {
  parse: ({ view }: { view: string }): { view: AskView } => {
    const known = viewAt(view)
    if (known === null) throw notFound()
    return { view: known }
  },
  stringify: ({ view }: { view: AskView }): { view: string } => ({
    view: VIEW_PATHS[view],
  }),
}

/** An ask of one kind, its block read. */
export type KindedAsk<K extends AskKind> = AskIssue & {
  readonly ask: Extract<AskFile, { kind: K }>
}

const isKind = <K extends AskKind>(
  issue: AskIssue,
  kind: K
): issue is KindedAsk<K> => issue.ask?.kind === kind

export const ofKind = <K extends AskKind>(
  asks: ReadonlyArray<AskIssue>,
  kind: K
): Array<KindedAsk<K>> => asks.filter((issue) => isKind(issue, kind))

const isWaiting = (issue: AskIssue): boolean => issue.answered === null

/** The waiting asks whose block can't be read: no kind, so no page. */
export const unreadOf = (asks: ReadonlyArray<AskIssue>): Array<AskIssue> =>
  asks.filter((issue) => issue.ask === null && isWaiting(issue))

export const waitingOf = (
  asks: ReadonlyArray<AskIssue>,
  kind: AskKind
): number => ofKind(asks, kind).filter(isWaiting).length

/** Where Asks opens: the first kind with an ask waiting, or decisions. */
export const landingKind = (asks: ReadonlyArray<AskIssue>): AskKind =>
  ASK_KINDS.find((kind) => waitingOf(asks, kind) > 0) ?? "decision"

/** What a block filed before the shared part never said. */
export type Unsaid = "unsaid"

/** A chip on one of the shared fields: any, one value, or not said. */
export type FieldPick<T extends string> = "all" | T | Unsaid

/** Which asks a list shows by whether they were answered. */
export const SHOWS = ["waiting", "answered", "all"] as const
export type Show = (typeof SHOWS)[number]

/** The orders a list can take. Answered asks come last under every one. */
export const ORDERS = ["longest", "newest", "aToZ"] as const
export type Order = (typeof ORDERS)[number]

/** Each shared field's values, then what was not said: the pivot's axes. */
const WAITS_SAID: ReadonlyArray<AskWaits | Unsaid> = [...ASK_WAITS, "unsaid"]
const CALLS_SAID: ReadonlyArray<AskCall | Unsaid> = [...ASK_CALLS, "unsaid"]

/** A list's chips on each shared field: any, then each value or not said. */
export const WAITS_PICKS: ReadonlyArray<FieldPick<AskWaits>> = [
  "all",
  ...WAITS_SAID,
]
export const CALL_PICKS: ReadonlyArray<FieldPick<AskCall>> = [
  "all",
  ...CALLS_SAID,
]

/** A list's chips, and which of its rows is open. */
export type ListState = {
  readonly waits: FieldPick<AskWaits>
  readonly call: FieldPick<AskCall>
  readonly show: Show
  readonly order: Order
  /** The open row's ask, by its id, or `null` when every row is shut. */
  readonly open: string | null
}

export const INITIAL_LIST: ListState = {
  waits: "all",
  call: "all",
  show: "waiting",
  order: "longest",
  open: null,
}

const oneOf = <T extends string>(
  value: unknown,
  among: ReadonlyArray<T>,
  otherwise: T
): T => among.find((member) => member === value) ?? otherwise

/** The list's state its address holds: anything unknown as it starts. */
export const listSearch = (search: Record<string, unknown>): ListState => ({
  waits: oneOf(search.waits, WAITS_PICKS, INITIAL_LIST.waits),
  call: oneOf(search.call, CALL_PICKS, INITIAL_LIST.call),
  show: oneOf(search.show, SHOWS, INITIAL_LIST.show),
  order: oneOf(search.order, ORDERS, INITIAL_LIST.order),
  open: typeof search.open === "string" ? search.open : null,
})

/** The address for `state`: only what differs from how a list starts. */
export const searchOf = (state: ListState): Partial<ListState> => ({
  ...(state.waits === INITIAL_LIST.waits ? {} : { waits: state.waits }),
  ...(state.call === INITIAL_LIST.call ? {} : { call: state.call }),
  ...(state.show === INITIAL_LIST.show ? {} : { show: state.show }),
  ...(state.order === INITIAL_LIST.order ? {} : { order: state.order }),
  ...(state.open === null ? {} : { open: state.open }),
})

export type ListEvent =
  | { readonly kind: "waits"; readonly waits: FieldPick<AskWaits> }
  | { readonly kind: "call"; readonly call: FieldPick<AskCall> }
  | { readonly kind: "show"; readonly show: Show }
  | { readonly kind: "order"; readonly order: Order }
  | { readonly kind: "toggled"; readonly id: string }

export function step(state: ListState, event: ListEvent): ListState {
  switch (event.kind) {
    case "waits": {
      return { ...state, waits: event.waits }
    }
    case "call": {
      return { ...state, call: event.call }
    }
    case "show": {
      return { ...state, show: event.show }
    }
    case "order": {
      return { ...state, order: event.order }
    }
    case "toggled": {
      return { ...state, open: state.open === event.id ? null : event.id }
    }
    default: {
      return assertNever(event)
    }
  }
}

const picks = <T extends string>(
  pick: FieldPick<T>,
  value: T | null
): boolean => pick === "all" || pick === (value ?? "unsaid")

const shows = (show: Show, issue: AskIssue): boolean => {
  switch (show) {
    case "all": {
      return true
    }
    case "waiting": {
      return isWaiting(issue)
    }
    case "answered": {
      return !isWaiting(issue)
    }
    default: {
      return assertNever(show)
    }
  }
}

/** Whether `state`'s chips, `over` any of them, let `issue` through. */
const matches = (
  state: ListState,
  issue: KindedAsk<AskKind>,
  over: Partial<ListState> = {}
): boolean => {
  const at = { ...state, ...over }
  return (
    picks(at.waits, issue.ask.waits) &&
    picks(at.call, issue.ask.call) &&
    shows(at.show, issue)
  )
}

const ordered = (order: Order): ((a: AskIssue, b: AskIssue) => number) => {
  switch (order) {
    case "longest": {
      return (a, b) =>
        Date.parse(a.opened) - Date.parse(b.opened) || byQuestion(a, b)
    }
    case "newest": {
      return (a, b) =>
        Date.parse(b.opened) - Date.parse(a.opened) || byQuestion(a, b)
    }
    case "aToZ": {
      return byQuestion
    }
    default: {
      return assertNever(order)
    }
  }
}

/** The rows `state` lists of `asks`, all of one kind: answered ones last. */
export const listed = <K extends AskKind>(
  asks: ReadonlyArray<KindedAsk<K>>,
  state: ListState
): Array<KindedAsk<K>> => {
  const within = ordered(state.order)
  return asks
    .filter((issue) => matches(state, issue))
    .sort((a, b) => Number(isWaiting(b)) - Number(isWaiting(a)) || within(a, b))
}

/** How many rows each chip would list, the other chips kept as they are. */
export function chipCounts(
  asks: ReadonlyArray<KindedAsk<AskKind>>,
  state: ListState
): {
  readonly waits: (waits: FieldPick<AskWaits>) => number
  readonly call: (call: FieldPick<AskCall>) => number
  readonly show: (show: Show) => number
} {
  const count = (over: Partial<ListState>): number =>
    asks.filter((issue) => matches(state, issue, over)).length
  return {
    waits: (waits) => count({ waits }),
    call: (call) => count({ call }),
    show: (show) => count({ show }),
  }
}

/** What the pivot counts: the waiting asks, or every one read. */
export const PIVOT_SHOWS = [
  "waiting",
  "all",
] as const satisfies ReadonlyArray<Show>
export type PivotShow = (typeof PIVOT_SHOWS)[number]

/** What the pivot counts, as its address's Show says: waiting unless all. */
export const pivotShowOf = (state: ListState): PivotShow =>
  state.show === "all" ? "all" : "waiting"

/**
 * The asks `show` counts, by call and by who waits, each cell split by
 * kind, so a cell opens each kind's list already picked; the calls and
 * waits no ask has are left out.
 */
export function pivot(
  asks: ReadonlyArray<AskIssue>,
  show: PivotShow
): {
  readonly calls: ReadonlyArray<AskCall | Unsaid>
  readonly waits: ReadonlyArray<AskWaits | Unsaid>
  readonly cell: (
    call: AskCall | Unsaid,
    waits: AskWaits | Unsaid
  ) => Readonly<Record<AskKind, number>>
} {
  const counted = asks.filter((issue) => shows(show, issue))
  const cell = (
    call: AskCall | Unsaid,
    waits: AskWaits | Unsaid
  ): Record<AskKind, number> => {
    const here = counted.filter(
      (issue) =>
        (issue.ask?.call ?? "unsaid") === call &&
        (issue.ask?.waits ?? "unsaid") === waits
    )
    return {
      decision: ofKind(here, "decision").length,
      checklist: ofKind(here, "checklist").length,
    }
  }
  const any = (counts: Record<AskKind, number>): boolean =>
    ASK_KINDS.some((kind) => counts[kind] > 0)
  return {
    calls: CALLS_SAID.filter((call) =>
      WAITS_SAID.some((waits) => any(cell(call, waits)))
    ),
    waits: WAITS_SAID.filter((waits) =>
      CALLS_SAID.some((call) => any(cell(call, waits)))
    ),
    cell,
  }
}
