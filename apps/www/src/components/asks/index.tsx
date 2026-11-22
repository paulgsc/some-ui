/**
 * The Asks pages' parts: the nav of the views, each kind's list, and the
 * pivot (`lib/asks/list`). Every row is one shape whatever its kind (what
 * it asks, who waits, what it unblocks, the call, since when), under chips
 * over the same fields; only an opened row is its kind's own: a decision's
 * options, each a choice, or a checklist's steps, each with where, what to
 * do, a box for what to paste back and Done. Every choice and step goes on
 * the ask's receipt (`lib/asks/receipt`), kept in this tab
 * (`lib/asks/kept`), which one button copies. The read is the query's
 * (`asksQuery`); the chips' state is the page's address, which the route
 * reads and `onStep` writes. Links into Asks are drawn only where this
 * build serves it (`hasAudience`, A3).
 */
import type { JSX, ReactNode } from "react"
import { Fragment, useId, useState, useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import { Badge, Button, Label, Notice, Textarea } from "@some-ui/shared"
import type { AskStep, ChecklistAsk, DecisionAsk } from "@some-ui/video-render"
import { useQuery } from "@tanstack/react-query"
import { Link, Navigate } from "@tanstack/react-router"

import type { AskIssue } from "@/lib/asks"
import { asksQuery, questionOf } from "@/lib/asks"
import type { KeptReceipts } from "@/lib/asks/kept"
import type {
  AskKind,
  AskView,
  FieldPick,
  KindedAsk,
  ListEvent,
  ListState,
  PivotShow,
  Unsaid,
} from "@/lib/asks/list"
import {
  ASK_KINDS,
  ASK_VIEWS,
  CALL_PICKS,
  chipCounts,
  landingKind,
  listed,
  step as listStep,
  ofKind,
  ORDERS,
  pivot,
  SHOWS,
  unreadOf,
  waitingOf,
  WAITS_PICKS,
} from "@/lib/asks/list"
import type { Receipt } from "@/lib/asks/receipt"
import { lastChosen, receiptText, stepsDone } from "@/lib/asks/receipt"
import { ASKS_WORDS as W } from "@/lib/asks/words"
import { hasAudience } from "@/lib/build-profile"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import { Chips } from "@/components/chips"
import { CopyButton } from "@/components/copy-button"

const NO_RECEIPT: Receipt = []

const Part = ({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): JSX.Element => (
  <section className="flex flex-col gap-2">
    <h3 className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
      {label}
    </h3>
    {children}
  </section>
)

/** A decision's options, each a choice; the last one chosen says so. */
const Options = ({
  ask,
  receipt,
  onChoose,
}: {
  ask: DecisionAsk
  receipt: Receipt
  onChoose: (option: number, note: string) => void
}): JSX.Element => {
  const [note, setNote] = useState("")
  const noteId = useId()
  const chosen = lastChosen(ask, receipt)
  return (
    <Part label={W.options}>
      <ol className="flex flex-col gap-2">
        {ask.options.map((option, place) => (
          <li
            key={option.says}
            className="flex items-start justify-between gap-4 rounded-lg border p-3"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">
                {option.says}
                {ask.recommended === place && (
                  <Badge variant="secondary" className="ml-2">
                    {W.recommended}
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground text-sm">
                {W.unblocks(option.unblocks)}
              </span>
            </div>
            {chosen === place ? (
              <span className="text-sm font-medium">{W.chosen}</span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onChoose(place, note)
                  setNote("")
                }}
              >
                {W.choose}
              </Button>
            )}
          </li>
        ))}
      </ol>
      <Label htmlFor={noteId}>{W.note}</Label>
      <Textarea
        id={noteId}
        value={note}
        rows={2}
        onChange={(event) => setNote(event.target.value)}
      />
    </Part>
  )
}

/** One step: where, what to do, what to paste back, and Done. */
const Step = ({
  step,
  place,
  of,
  done,
  onDone,
}: {
  step: AskStep
  place: number
  of: number
  done: boolean
  onDone: (pasted: string) => void
}): JSX.Element => {
  const [pasted, setPasted] = useState("")
  const id = useId()
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium">
          <span className="text-muted-foreground mr-2 text-sm">
            {W.step(place, of)}
          </span>
          {step.says}
        </span>
        {done && <Badge variant="secondary">{W.isDone}</Badge>}
      </div>
      {step.where !== undefined && (
        <p className="text-muted-foreground text-sm">{W.where(step.where)}</p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {step.do.map((line, at) => (
          // A step's lines are fixed while it shows, and may repeat.
          // eslint-disable-next-line react/no-array-index-key
          <li key={at}>{line}</li>
        ))}
      </ol>
      {step.paste !== undefined && (
        <>
          <Label htmlFor={id}>
            {step.paste} · {W.paste}
          </Label>
          <Textarea
            id={id}
            value={pasted}
            rows={3}
            className="font-mono text-xs"
            onChange={(event) => setPasted(event.target.value)}
          />
        </>
      )}
      <Button
        size="sm"
        className="self-start"
        variant={done ? "outline" : "default"}
        onClick={() => {
          onDone(pasted)
          setPasted("")
        }}
      >
        {done ? W.doneAgain : W.done}
      </Button>
    </li>
  )
}

const Steps = ({
  ask,
  receipt,
  onDone,
}: {
  ask: ChecklistAsk
  receipt: Receipt
  onDone: (step: number, pasted: string) => void
}): JSX.Element => {
  const done = stepsDone(ask, receipt)
  return (
    <Part label={W.stepsDone(done.size, ask.steps.length)}>
      <ol className="flex flex-col gap-2">
        {ask.steps.map((step, place) => (
          <Step
            key={step.says}
            step={step}
            place={place}
            of={ask.steps.length}
            done={done.has(place)}
            onDone={(pasted) => onDone(place, pasted)}
          />
        ))}
      </ol>
    </Part>
  )
}

/** One ask opened: why it's the owner's, its kind's part, its receipt. */
const AskBody = ({
  issue,
  kept,
}: {
  issue: KindedAsk<AskKind>
  kept: KeptReceipts
}): JSX.Element => {
  const receipts = useSyncExternalStore(kept.subscribe, kept.getSnapshot)
  const receipt = receipts.get(issue.id) ?? NO_RECEIPT
  const { ask } = issue
  return (
    <div className="flex flex-col gap-3">
      <Part label={W.whyYours}>
        <p className="text-sm">{ask.whyYours}</p>
      </Part>
      {ask.kind === "decision" ? (
        <Options
          ask={ask}
          receipt={receipt}
          onChoose={(option, note) =>
            kept.append(issue.id, ask, {
              kind: "chose",
              option,
              note,
              at: new Date(),
            })
          }
        />
      ) : (
        <Steps
          ask={ask}
          receipt={receipt}
          onDone={(step, pasted) =>
            kept.append(issue.id, ask, {
              kind: "step",
              step,
              pasted,
              at: new Date(),
            })
          }
        />
      )}
      {receipt.length > 0 && (
        <Part label={W.receipt}>
          <p className="text-sm">{W.receiptHolds(receipt.length)}</p>
          <CopyButton text={receiptText(issue, receipt)} what={W.copyWhat} />
        </Part>
      )}
      <a
        href={issue.url}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground self-start text-sm underline underline-offset-4"
      >
        {W.open}
      </a>
    </div>
  )
}

const said = <T extends string>(
  value: T | null,
  words: Readonly<Record<T, string>>
): ReactNode =>
  value === null ? (
    <span className="text-muted-foreground">{W.unsaid}</span>
  ) : (
    words[value]
  )

const pickWords = <T extends string>(
  pick: FieldPick<T>,
  words: Readonly<Record<T, string>>
): string =>
  pick === "all" ? W.all : pick === "unsaid" ? W.unsaid : words[pick]

/** One kind's asks: chips over one row shape, each opening to its ask. */
const KindList = ({
  kind,
  asks,
  kept,
  state,
  onStep,
}: {
  kind: AskKind
  asks: ReadonlyArray<AskIssue>
  kept: KeptReceipts
  state: ListState
  onStep: (next: ListState) => void
}): JSX.Element => {
  const bodyId = useId()
  const mine = ofKind(asks, kind)
  if (mine.length === 0)
    return <p className="text-muted-foreground text-sm">{W.noneOf[kind]}</p>
  const dispatch = (event: ListEvent): void => onStep(listStep(state, event))
  const counts = chipCounts(mine, state)
  const rows = listed(mine, state)
  return (
    <div className="flex flex-col gap-3">
      <Chips
        label={W.waitsLabel}
        labelled
        options={WAITS_PICKS.map(
          (waits) =>
            [
              waits,
              `${pickWords(waits, W.waits)} ${String(counts.waits(waits))}`,
            ] as const
        )}
        pressed={(waits) => state.waits === waits}
        disabled={(waits) => waits !== state.waits && counts.waits(waits) === 0}
        onToggle={(waits) => dispatch({ kind: "waits", waits })}
      />
      <Chips
        label={W.callLabel}
        labelled
        options={CALL_PICKS.map(
          (call) =>
            [
              call,
              `${pickWords(call, W.calls)} ${String(counts.call(call))}`,
            ] as const
        )}
        pressed={(call) => state.call === call}
        disabled={(call) => call !== state.call && counts.call(call) === 0}
        onToggle={(call) => dispatch({ kind: "call", call })}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Chips
          label={W.showLabel}
          labelled
          options={SHOWS.map(
            (show) =>
              [show, `${W.shows[show]} ${String(counts.show(show))}`] as const
          )}
          pressed={(show) => state.show === show}
          onToggle={(show) => dispatch({ kind: "show", show })}
        />
        <Chips
          label={W.orderLabel}
          labelled
          options={ORDERS.map((order) => [order, W.orders[order]] as const)}
          pressed={(order) => state.order === order}
          onToggle={(order) => dispatch({ kind: "order", order })}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{W.noneShown}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-b text-left text-xs tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2 font-bold">{W.asks}</th>
              <th className="px-3 py-2 font-bold">{W.waitsLabel}</th>
              <th className="px-3 py-2 font-bold">{W.unblocksColumn}</th>
              <th className="px-3 py-2 font-bold">{W.callLabel}</th>
              <th className="px-3 py-2 font-bold">{W.sinceColumn}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((issue) => {
              const isOpen = state.open === issue.id
              const answered = issue.answered !== null
              return (
                <Fragment key={issue.id}>
                  <tr
                    className={cn(
                      "border-b align-top",
                      isOpen && "bg-muted/50",
                      answered && "text-muted-foreground"
                    )}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`${bodyId}-${issue.id}`}
                        className="text-left font-medium hover:underline"
                        onClick={() =>
                          dispatch({ kind: "toggled", id: issue.id })
                        }
                      >
                        {questionOf(issue)}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {said(issue.ask.waits, W.waits)}
                    </td>
                    <td className="px-3 py-2">
                      {issue.ask.unblocks ?? (
                        <span className="text-muted-foreground">
                          {W.unsaid}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {said(issue.ask.call, W.calls)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {W.since(issue.opened, issue.answered)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr
                      id={`${bodyId}-${issue.id}`}
                      className="bg-muted/50 border-b"
                    >
                      <td colSpan={5} className="px-3 pt-1 pb-4">
                        <AskBody issue={issue} kept={kept} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** The asks, once read, or what stands in for them until they are. */
const WithAsks = ({
  children,
}: {
  children: (asks: ReadonlyArray<AskIssue>) => JSX.Element
}): JSX.Element =>
  matchQueryOutcome(queryOutcome(useQuery(asksQuery)), {
    pending: () => <p className="text-muted-foreground text-sm">{W.reading}</p>,
    failed: (_error, retry) => (
      <div className="flex flex-col gap-2">
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
    ready: (asks, refreshError) => (
      <>
        {refreshError !== undefined && (
          <Notice
            tone="warning"
            dismissible
            action={{ label: W.tryAgain, onClick: refreshError.retry }}
          >
            {W.stale}
          </Notice>
        )}
        {children(asks)}
      </>
    ),
  })

/** One kind's page: its asks, as the address's chips pick them. */
export const AskList = ({
  kind,
  kept,
  state,
  onStep,
}: {
  kind: AskKind
  kept: KeptReceipts
  state: ListState
  onStep: (next: ListState) => void
}): JSX.Element => (
  <WithAsks>
    {(asks) => (
      <KindList
        kind={kind}
        asks={asks}
        kept={kept}
        state={state}
        onStep={onStep}
      />
    )}
  </WithAsks>
)

/** A link to a view of Asks, drawn only where this build serves it. */
const ToView = ({
  view,
  search,
  className,
  children,
}: {
  view: AskView
  search?: Partial<ListState>
  className?: string
  children: ReactNode
}): JSX.Element =>
  hasAudience("lan") ? (
    <Link
      to="/asks/$view"
      params={{ view }}
      search={search ?? {}}
      className={className}
      activeOptions={{ includeSearch: false }}
      activeProps={{ className: "bg-muted text-foreground font-medium" }}
    >
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  )

/**
 * The pivot: every ask counted by its call and by who waits on it, each
 * cell's count split by kind and opening that kind's list, picked.
 */
export const AsksPivot = ({
  show,
  onShow,
}: {
  show: PivotShow
  onShow: (show: PivotShow) => void
}): JSX.Element => (
  <WithAsks>
    {(asks) => {
      const grid = pivot(asks, show)
      return (
        <div className="flex flex-col gap-3">
          <Chips
            label={W.showLabel}
            labelled
            options={(["waiting", "all"] as const).map(
              (s) => [s, W.pivotCounts[s]] as const
            )}
            pressed={(s) => s === show}
            onToggle={onShow}
          />
          {grid.calls.length === 0 ? (
            <p className="text-muted-foreground text-sm">{W.pivotNone}</p>
          ) : (
            <table className="text-sm">
              <thead className="text-muted-foreground border-b text-left text-xs tracking-wider uppercase">
                <tr>
                  <th className="px-3 py-2 font-bold">{W.pivotCorner}</th>
                  {grid.waits.map((waits) => (
                    <th key={waits} className="px-3 py-2 font-bold">
                      {fieldWords(waits, W.waits)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.calls.map((call) => (
                  <tr key={call} className="border-b align-top">
                    <th className="px-3 py-2 text-left font-medium">
                      {fieldWords(call, W.calls)}
                    </th>
                    {grid.waits.map((waits) => {
                      const counts = grid.cell(call, waits)
                      return (
                        <td key={waits} className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            {ASK_KINDS.filter((kind) => counts[kind] > 0).map(
                              (kind) => (
                                <ToView
                                  key={kind}
                                  view={kind}
                                  search={{ call, waits, show }}
                                  className="underline underline-offset-4"
                                >
                                  {W.inCell[kind](counts[kind])}
                                </ToView>
                              )
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )
    }}
  </WithAsks>
)

const fieldWords = <T extends string>(
  value: T | Unsaid,
  words: Readonly<Record<T, string>>
): string => (value === "unsaid" ? W.unsaid : words[value])

/**
 * The views of Asks, each kind with how many of it wait, and the waiting
 * asks whose block can't be read (no kind, so no page), by their GitHub
 * page. It names each view by a link of its own, not the shared ViewStrip,
 * which is a row of tabs over fixed addresses with no counts.
 */
export const AsksNav = (): JSX.Element => {
  const { data } = useQuery(asksQuery)
  const unread = data === undefined ? [] : unreadOf(data)
  return (
    <nav aria-label={W.nav} className="flex w-56 shrink-0 flex-col gap-1">
      {ASK_VIEWS.map((view) => (
        <ToView
          key={view}
          view={view}
          className="text-muted-foreground flex h-9 items-center justify-between rounded-md px-3 text-sm"
        >
          {W.views[view]}
          {data !== undefined && view !== "pivot" && (
            <span className="tabular-nums">{waitingOf(data, view)}</span>
          )}
        </ToView>
      ))}
      {unread.length > 0 && (
        <div className="text-muted-foreground mt-3 flex flex-col gap-1 border-t px-3 pt-3 text-xs">
          <span>{W.unreadHere(unread.length)}</span>
          {unread.map((issue) => (
            <a
              key={issue.id}
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              {questionOf(issue)}
            </a>
          ))}
        </div>
      )}
    </nav>
  )
}

const Landing = (): JSX.Element =>
  matchQueryOutcome(queryOutcome(useQuery(asksQuery)), {
    pending: () => <p className="text-muted-foreground text-sm">{W.reading}</p>,
    // The kind's own page says the asks couldn't be read, and retries.
    failed: () => (
      <Navigate to="/asks/$view" params={{ view: landingKind([]) }} replace />
    ),
    ready: (asks) => (
      <Navigate to="/asks/$view" params={{ view: landingKind(asks) }} replace />
    ),
  })

/** Asks itself: on to the first kind with an ask waiting, once read. */
export const AsksLanding = (): JSX.Element | null =>
  hasAudience("lan") ? <Landing /> : null
