/**
 * The Cooking page's parts (`routes/_dashboard/_lan/cooking.tsx`; C1116,
 * C1117, C1119, C1160, C1161): the bar pinned at the top with the one most
 * urgent blocker, the card that shows one stop with every train in
 * miniature beside it, and the trains below, each an accordion, behind a
 * Show and Order menu and paged. The read is the query's (`cookingQuery`);
 * where each train stands is `lib/cooking/model`'s, the colours and the
 * bar's pick `lib/cooking/algebra`'s, and the list, the card and every tap
 * `lib/cooking/board`'s pure step. This draws them and forwards taps.
 */
import type { JSX, ReactNode } from "react"
import { useReducer } from "react"
import { cn } from "@some-ui/core-utils"
import {
  Button,
  Notice,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StationStrip,
} from "@some-ui/shared"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react"

import { cookingQuery } from "@/lib/cooking"
import type { Blocker, Urgency } from "@/lib/cooking/algebra"
import { blockers, urgencyOf, waitingOn } from "@/lib/cooking/algebra"
import type { Board, BoardEvent } from "@/lib/cooking/board"
import {
  activeOf,
  FILTERS,
  INITIAL_BOARD,
  matches,
  narrowed,
  ordered,
  pageOf,
  pagesOf,
  selectedOf,
  shown,
  SORTS,
  stepBoard,
  TRAINS_MAX,
  TRAINS_PER_PAGE,
} from "@/lib/cooking/board"
import type { Stop, Train } from "@/lib/cooking/model"
import { hereOf, onYou } from "@/lib/cooking/model"
import { COOKING_WORDS as W } from "@/lib/cooking/words"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"

import { LOOKS, QUIET_PILL } from "./theme"

type Dispatch = (event: BoardEvent) => void

/** A time of day, as the owner's clock shows it. */
const clock = (iso: string | null): string | null =>
  iso === null
    ? null
    : new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })

/** Who holds a stop, drawn by the algebra where its train stands. */
const HolderPill = ({
  stop,
  urgency,
}: {
  stop: Stop
  urgency: Urgency | null
}): JSX.Element => (
  <span
    className={cn(
      "inline-flex items-center rounded-full border-[1.5px] px-2 text-xs font-semibold whitespace-nowrap",
      stop.holder === null
        ? "text-success border-success/40"
        : urgency === null
          ? QUIET_PILL[stop.holder]
          : LOOKS[stop.holder][urgency].pill
    )}
  >
    {stop.holder === null ? W.arrives : W.holder[stop.holder]}
    {urgency === "now" && ` · ${W.urgency.now.toLowerCase()}`}
  </span>
)

/** The urgency of `stop` on `train`: only where it stands. */
const urgencyAt = (
  train: Train,
  at: number,
  trains: ReadonlyArray<Train>
): Urgency | null => (at === train.current ? urgencyOf(train, trains) : null)

/** The bar at the top: how many wait on the owner, and the most urgent blocker. */
const AlertBar = ({
  trains,
  top,
  dispatch,
}: {
  trains: ReadonlyArray<Train>
  top: Blocker | undefined
  dispatch: Dispatch
}): JSX.Element => {
  const mine = trains.filter(onYou).length
  if (top === undefined)
    return (
      <div className="bg-success/10 sticky top-0 z-20 flex h-9 items-center px-4 text-sm">
        {W.allArrived}
      </div>
    )
  const waiting = waitingOn(top.train, trains).map((t) => t.title)
  const others = W.barOthers(
    W.holder[top.holder],
    top.stop.label,
    top.train.title
  )
  // The yours wording only over a stop of the owner's; a more urgent stop
  // of someone else's is said as theirs, with the count still on the left.
  const message =
    top.holder === "you"
      ? W.barYours(W.urgency[top.urgency], top.stop.label, waiting)
      : mine > 0
        ? others
        : `${W.nothingOnYou} ${others}`
  return (
    <button
      type="button"
      onClick={() =>
        dispatch({
          kind: "picked",
          train: top.train.id,
          stop: top.train.current,
        })
      }
      className={cn(
        "sticky top-0 z-20 flex h-9 w-full items-center gap-3 px-4 text-left text-sm",
        LOOKS[top.holder][top.urgency].bar
      )}
    >
      <span className="font-semibold whitespace-nowrap">
        {mine > 0 ? W.waitOnYou(mine) : W.allMoving}
      </span>
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <span className="text-xs whitespace-nowrap opacity-85">{W.show}</span>
    </button>
  )
}

/** Every train in miniature, one thin row each: where the card is in the whole. */
const Overview = ({
  board,
  trains,
  selected,
  dispatch,
}: {
  board: Board
  trains: ReadonlyArray<Train>
  selected: Train
  dispatch: Dispatch
}): JSX.Element => {
  const all = ordered({ ...board, filter: "all" }, trains)
  const width = 168
  const row = 12
  const pad = 8
  const height = 12 + row * all.length
  return (
    <svg
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      width={width}
      height={height}
      role="img"
      aria-label={W.overview(all.length)}
      className="bg-muted/40 rounded-md border"
    >
      {all.map((train, r) => {
        const y = 6 + r * row + row / 2
        const gap = (width - pad * 2) / Math.max(1, train.stops.length - 1)
        const x = (i: number): number => pad + i * gap
        const mine = train.id === selected.id
        const urgency = urgencyOf(train, trains)
        const here = hereOf(train)
        return (
          <g
            key={train.id}
            className={matches(board.filter, train) ? undefined : "opacity-35"}
          >
            <title>{`${train.title}: ${here.label}`}</title>
            {mine && (
              <rect
                x={1}
                y={y - row / 2 + 1}
                width={width - 2}
                height={row - 2}
                rx={3}
                className="fill-background stroke-foreground stroke-[0.8]"
              />
            )}
            <line
              x1={x(0)}
              y1={y}
              x2={x(train.current)}
              y2={y}
              className="stroke-success stroke-[1.5]"
            />
            <line
              x1={x(train.current)}
              y1={y}
              x2={x(train.stops.length - 1)}
              y2={y}
              className="stroke-border stroke-[1.5]"
            />
            {train.stops.map((stop, i) => (
              <circle
                key={`${train.id}-${String(i)}`}
                cx={x(i)}
                cy={y}
                r={i === train.current ? 3.6 : 2.2}
                onClick={() =>
                  dispatch({ kind: "picked", train: train.id, stop: i })
                }
                className={cn(
                  "cursor-pointer",
                  stop.state === "passed"
                    ? "fill-success"
                    : i === train.current &&
                        stop.holder !== null &&
                        urgency !== null
                      ? cn(LOOKS[stop.holder][urgency].dot, "stroke-[1.6]")
                      : cn(
                          "fill-background stroke-border stroke-[1.2]",
                          stop.holder === "you" &&
                            "stroke-warning [stroke-dasharray:1.5_1.2]"
                        )
                )}
              />
            ))}
            {mine && (
              <circle
                cx={x(activeOf(board, train))}
                cy={y}
                r={5.2}
                className="stroke-foreground pointer-events-none fill-none stroke-[1.3]"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** The card: one stop of the selected train, walked by its arrows and dots. */
const StopCard = ({
  board,
  trains,
  train,
  dispatch,
}: {
  board: Board
  trains: ReadonlyArray<Train>
  train: Train
  dispatch: Dispatch
}): JSX.Element => {
  const at = activeOf(board, train)
  const stop = train.stops[at] ?? hereOf(train)
  const urgency = urgencyAt(train, at, trains)
  const since = clock(stop.since)
  return (
    <section
      aria-roledescription="slideshow"
      aria-label={W.stopOf(train.title, at, train.stops.length)}
      className={cn(
        "bg-card grid gap-4 rounded-xl border border-t-4 p-4 sm:grid-cols-[1fr_auto]",
        stop.holder !== null && urgency !== null
          ? LOOKS[stop.holder][urgency].edge
          : "border-t-border"
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-muted-foreground text-xs">
          {W.stopOf(train.title, at, train.stops.length)}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <HolderPill stop={stop} urgency={urgency} />
          <h2 className="text-lg font-semibold">{stop.label}</h2>
        </div>
        <span className="text-muted-foreground text-sm">
          {stop.state === "passed"
            ? W.passed(since)
            : stop.state === "here"
              ? W.here(since)
              : W.ahead}
        </span>
        <p className="text-sm">{stop.now}</p>
        {stop.link?.kind === "page" && (
          <a
            className="text-sm underline"
            href={stop.link.url}
            target="_blank"
            rel="noreferrer"
          >
            {W.page}
          </a>
        )}
        {stop.link?.kind === "goal" && (
          <button
            type="button"
            className="self-start text-sm underline"
            onClick={() => {
              const goal = stop.link?.kind === "goal" ? stop.link.goal : ""
              const other = trains.find((t) => t.id === goal)
              if (other !== undefined)
                dispatch({
                  kind: "picked",
                  train: other.id,
                  stop: other.current,
                })
            }}
          >
            {W.goTo(
              trains.find(
                (t) => stop.link?.kind === "goal" && t.id === stop.link.goal
              )?.title ?? ""
            )}
          </button>
        )}
        {stop.log.length > 0 && (
          <ol aria-label={W.logTitle} className="flex flex-col gap-0.5 text-sm">
            {stop.log.map((line, place) => (
              <li
                key={`${String(place)}-${line.says}`}
                className="grid grid-cols-[3.5rem_1fr] gap-2"
              >
                <time className="text-muted-foreground text-right tabular-nums">
                  {clock(line.at) ?? ""}
                </time>
                <span>{line.says}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label={W.previous}
            disabled={at === 0}
            onClick={() => dispatch({ kind: "slid", by: -1 })}
          >
            ←
          </Button>
          <StationStrip
            small
            label={W.stopOf(train.title, at, train.stops.length)}
            stations={train.stops.map((s, i) => ({
              id: String(i),
              name: s.label,
            }))}
            at={String(train.current)}
            picked={String(at)}
            onPick={(id) =>
              dispatch({ kind: "picked", train: train.id, stop: Number(id) })
            }
            className="w-28"
          />
          <Button
            size="sm"
            variant="outline"
            aria-label={W.next}
            disabled={at === train.stops.length - 1}
            onClick={() => dispatch({ kind: "slid", by: 1 })}
          >
            →
          </Button>
        </div>
        <Overview
          board={board}
          trains={trains}
          selected={train}
          dispatch={dispatch}
        />
      </div>
    </section>
  )
}

/** The Show and Order chips, behind one icon (C1160, C1161). */
const Menu = ({
  board,
  trains,
  dispatch,
}: {
  board: Board
  trains: ReadonlyArray<Train>
  dispatch: Dispatch
}): JSX.Element => {
  const count = (f: (typeof FILTERS)[number]): number =>
    ordered({ ...board, filter: "all" }, trains).filter((t) => matches(f, t))
      .length
  const filterWords = (f: (typeof FILTERS)[number]): string =>
    f === "all" || f === "you" || f === "moving" ? W.filters[f] : W.lands[f]
  const chip = (pressed: boolean): string =>
    cn(
      "rounded-full border px-3 py-1 text-sm",
      pressed
        ? "bg-foreground text-background border-foreground"
        : "bg-background"
    )
  return (
    <div className="flex min-h-8 items-center justify-end gap-3">
      {narrowed(board) && (
        <span className="text-muted-foreground text-sm">
          {`${filterWords(board.filter)} · ${W.sorts[board.sort]}`}
        </span>
      )}
      <Popover
        open={board.menu}
        onOpenChange={(open) => dispatch({ kind: "menu", open })}
      >
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            aria-label={W.showAndOrder}
            className="relative"
          >
            <SlidersHorizontal className="size-4" />
            {narrowed(board) && (
              <span
                aria-hidden
                className="bg-primary border-background absolute -top-1 -right-1 size-2.5 rounded-full border-2"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="flex w-[min(34rem,86vw)] flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-xs">
              {W.showLabel}
            </span>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={board.filter === f}
                className={chip(board.filter === f)}
                onClick={() => dispatch({ kind: "filtered", filter: f })}
              >
                {filterWords(f)}{" "}
                <span className="tabular-nums opacity-70">{count(f)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-xs">
              {W.orderLabel}
            </span>
            {SORTS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={board.sort === s}
                className={chip(board.sort === s)}
                onClick={() => dispatch({ kind: "sorted", sort: s })}
              >
                {W.sorts[s]}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** One train: an accordion that opens to its motive, its line pickable. */
const Rail = ({
  board,
  trains,
  train,
  selected,
  dispatch,
}: {
  board: Board
  trains: ReadonlyArray<Train>
  train: Train
  selected: boolean
  dispatch: Dispatch
}): JSX.Element => {
  const open = board.open === train.id
  const here = hereOf(train)
  const urgency = urgencyOf(train, trains)
  return (
    <li
      className={cn(
        "bg-card rounded-xl border",
        selected && "border-foreground"
      )}
    >
      <div className="grid grid-cols-1 items-center gap-3 p-3 md:grid-cols-[1.4fr_1fr_1.6fr]">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => dispatch({ kind: "toggled", train: train.id })}
          className="flex items-start gap-2 text-left"
        >
          {open ? (
            <ChevronDown
              aria-hidden
              className="text-muted-foreground mt-1 size-4 shrink-0"
            />
          ) : (
            <ChevronRight
              aria-hidden
              className="text-muted-foreground mt-1 size-4 shrink-0"
            />
          )}
          <span>
            <span className="block font-semibold">{train.title}</span>
            <span className="text-muted-foreground block text-sm">
              {train.dest}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2 text-sm">
          <HolderPill stop={here} urgency={urgency} />
          <span className="min-w-0 truncate">{here.label}</span>
        </div>
        <StationStrip
          small
          label={train.title}
          stations={train.stops.map((s, i) => ({
            id: String(i),
            name: s.label,
          }))}
          at={String(train.current)}
          tone={
            here.holder !== null && urgency !== null
              ? cn(LOOKS[here.holder][urgency].mark, "border-2")
              : undefined
          }
          picked={selected ? String(activeOf(board, train)) : undefined}
          onPick={(id) =>
            dispatch({ kind: "picked", train: train.id, stop: Number(id) })
          }
        />
      </div>
      {open && (
        <div className="flex flex-col gap-1 px-3 pb-3 md:pl-9">
          <p className="text-sm">{train.motive}</p>
          <span className="text-muted-foreground text-xs">
            {W.landsOn(W.lands[train.lands])}
          </span>
        </div>
      )}
    </li>
  )
}

/** The bar, the card and the trains, over the run's trains. */
const CookingBoard = ({
  trains,
  heading = null,
  unread,
  onReadAgain,
}: {
  trains: ReadonlyArray<Train>
  /** How many of GitHub's answers couldn't be read this time. */
  unread: number
  onReadAgain: () => void
  /** What sits under the bar: the page's title. */
  heading?: ReactNode
}): JSX.Element => {
  const ranked = blockers(trains)
  const fallback = ranked[0]?.train.id ?? null
  const [board, dispatch] = useReducer(
    (b: Board, e: BoardEvent) => stepBoard(b, e, trains, fallback),
    INITIAL_BOARD
  )
  const selected = selectedOf(board, trains, fallback)
  const list = shown(board, trains)
  const page = pageOf(board, trains)
  const pages = pagesOf(board, trains)
  const slice = list.slice(page * TRAINS_PER_PAGE, (page + 1) * TRAINS_PER_PAGE)
  return (
    <div className="flex flex-col gap-4">
      <AlertBar trains={trains} top={ranked[0]} dispatch={dispatch} />
      {heading}
      {unread > 0 && <Notice tone="warning">{W.someUnread(unread)}</Notice>}
      {selected !== null && (
        <StopCard
          board={board}
          trains={trains}
          train={selected}
          dispatch={dispatch}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <Button size="sm" variant="ghost" onClick={onReadAgain}>
          {W.readAgain}
        </Button>
        <Menu board={board} trains={trains} dispatch={dispatch} />
      </div>
      {slice.length === 0 ? (
        <p className="text-muted-foreground text-sm">{W.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {slice.map((train) => (
            <Rail
              key={train.id}
              board={board}
              trains={trains}
              train={train}
              selected={selected?.id === train.id}
              dispatch={dispatch}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {W.trainsOf(
            slice.length === 0 ? 0 : page * TRAINS_PER_PAGE + 1,
            page * TRAINS_PER_PAGE + slice.length,
            list.length
          )}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => dispatch({ kind: "paged", page: page - 1 })}
          >
            {W.previousPage}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages - 1}
            onClick={() => dispatch({ kind: "paged", page: page + 1 })}
          >
            {W.nextPage}
          </Button>
        </div>
      </div>
      {trains.length > TRAINS_MAX && (
        <p className="text-muted-foreground text-sm">
          {W.overCap(TRAINS_MAX, trains.length)}
        </p>
      )}
    </div>
  )
}

/** Today's trains, or what stands in for them until they're read. */
export const CookingPage = ({
  heading = null,
}: {
  heading?: ReactNode
}): JSX.Element => {
  const query = useQuery(cookingQuery)
  // A read the owner asks for: the page never reads on a timer (`lib/cooking`).
  const readAgain = (): void => {
    void query.refetch()
  }
  return matchQueryOutcome(queryOutcome(query), {
    pending: () => (
      <>
        {heading}
        <p className="text-muted-foreground text-sm">{W.reading}</p>
      </>
    ),
    failed: (_error, retry) => (
      <div className="flex flex-col gap-2">
        {heading}
        <p className="text-sm">{W.away}</p>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={retry}
        >
          {W.tryAgain}
        </Button>
      </div>
    ),
    ready: (cooking, refreshError) => (
      <>
        {cooking.kind !== "run" && heading}
        {refreshError !== undefined && (
          <Notice
            tone="warning"
            dismissible
            action={{ label: W.tryAgain, onClick: refreshError.retry }}
          >
            {W.stale}
          </Notice>
        )}
        {cooking.kind === "none" && (
          <p className="text-muted-foreground text-sm">{W.noRun}</p>
        )}
        {cooking.kind === "unread" && (
          <p className="text-sm">
            {W.unreadRun}{" "}
            <a
              className="underline"
              href={cooking.url}
              target="_blank"
              rel="noreferrer"
            >
              {W.runPage}
            </a>
          </p>
        )}
        {cooking.kind === "run" &&
          (cooking.trains.length === 0 ? (
            <>
              {heading}
              <p className="text-muted-foreground text-sm">{W.noGoals}</p>
            </>
          ) : (
            <CookingBoard
              trains={cooking.trains}
              heading={heading}
              unread={cooking.unread}
              onReadAgain={readAgain}
            />
          ))}
      </>
    ),
  })
}
