/**
 * Studio › Renders › Run it again (RETRY): why a render couldn't finish,
 * the owner's steps to run it again as far as this phone can take them, and
 * the button, on only once nothing waits on the owner. Takes home couldn't
 * hear open Needs your attention showing just those takes. Once tapped, the
 * page follows the run on the conveyor (`StationStrip`, as Renders and the
 * takes conveyor draw it), with a line of when and for how long at each step,
 * the board read again every half minute until it is done or stops. The
 * board and the takes are read by their queries; the tap is
 * `lib/renders/again`'s runtime (R1); every word is `lib/renders/again`'s.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import { Button, Notice, StationStrip } from "@some-ui/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type { Board, RenderFailed } from "@/lib/renders"
import {
  failedLine,
  renderName,
  RENDERS_WORDS,
  rendersAgainIn,
  rendersQuery,
  WHILE_UNDER_WAY_MS,
} from "@/lib/renders"
import type { AgainState, Plan, Said, Step } from "@/lib/renders/again"
import {
  AGAIN_CONVEYOR_WORDS,
  AGAIN_STATIONS,
  AGAIN_WORDS,
  againAttentionQuery,
  answerLine,
  canRun,
  createAgain,
  FOLLOW_FOR,
  planOf,
  runAgainHome,
  runLine,
  settled,
  stepLine,
  stepLog,
  stepStation,
  stopOf,
  takesStep,
  toTakes,
  youLine,
} from "@/lib/renders/again"

import { ReadList, StudioPage } from "./layout"

const WORDS = AGAIN_WORDS

const LINK =
  "text-brand self-start text-sm font-semibold underline underline-offset-4"

/**
 * What happened, where, and what home does about it (`failedLine`), then
 * what the owner can do (`youLine`): the owner's "immediate understanding"
 * of a render that couldn't finish, said before any step.
 */
const WhatHappened = ({ row }: { row: RenderFailed }): JSX.Element => (
  <dl className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
        {WORDS.whatHappened}
      </dt>
      <dd className="text-sm">{failedLine(row)}</dd>
    </div>
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
        {WORDS.whatYouCanDo}
      </dt>
      <dd className="text-sm">{youLine(row)}</dd>
    </div>
  </dl>
)

/** A step's mark: done, the owner's to take, or waiting on another. */
const Mark = ({
  tone,
  children,
}: {
  tone: "done" | "todo" | "wait"
  children: ReactNode
}): JSX.Element => (
  <span
    aria-hidden
    className={cn(
      "flex size-7 flex-none items-center justify-center rounded-full text-sm font-bold",
      tone === "done" && "bg-success/15 text-success",
      tone === "todo" && "bg-warning/15 text-warning",
      tone === "wait" && "bg-muted text-muted-foreground"
    )}
  >
    {children}
  </span>
)

const StepItem = ({
  tone,
  mark,
  title,
  line,
  children,
}: {
  tone: "done" | "todo" | "wait"
  mark: string
  title: string
  line: string
  children?: ReactNode
}): JSX.Element => (
  <li className="flex gap-3">
    <Mark tone={tone}>{mark}</Mark>
    <div className="flex flex-col gap-2">
      <p
        className={cn(
          "text-sm font-semibold",
          tone === "wait" && "text-muted-foreground"
        )}
      >
        {title}
      </p>
      <p className="text-muted-foreground text-sm">{line}</p>
      {children}
    </div>
  </li>
)

/** What a tap came to, where it is no step to follow. */
function saidLine(said: Said): string | null {
  switch (said.kind) {
    case "answer": {
      return said.answer.kind === "step" ? null : answerLine(said.answer)
    }
    case "away": {
      return WORDS.away
    }
    case "busy": {
      return WORDS.busy
    }
    case "unpaired": {
      return WORDS.unpaired
    }
    default: {
      return assertNever(said)
    }
  }
}

/** The step a tap's answer gave, if any. */
const stepOfSaid = (state: AgainState): Step | null =>
  state.kind === "said" &&
  state.said.kind === "answer" &&
  state.said.answer.kind === "step"
    ? state.said.answer.step
    : null

/**
 * The run on the conveyor: where it is, the side track it stopped on, what
 * is happening, and since when (C1164's conveyor, as the owner asked).
 */
const Conveyor = ({ step, now }: { step: Step; now: number }): JSX.Element => {
  const { at, aside } = stepStation(step)
  return (
    <div className="flex flex-col gap-2">
      <StationStrip
        label={AGAIN_CONVEYOR_WORDS.label}
        stations={AGAIN_STATIONS.map((id) => ({
          id,
          name: AGAIN_CONVEYOR_WORDS.stations[id],
        }))}
        at={at}
        aside={
          aside === null
            ? null
            : { name: AGAIN_CONVEYOR_WORDS.asides[aside], line: stepLine(step) }
        }
      />
      {aside === null && <p className="text-sm">{stepLine(step)}</p>}
      <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
        {stepLog(step, now).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The way to Needs your attention, showing only `takes`: a page of the
 * phone's ("apk"), as this one is (A3).
 */
const ToTakes = ({
  row,
  takes,
}: {
  row: RenderFailed
  takes: ReadonlyArray<string>
}): JSX.Element | null =>
  !hasAudience("apk") ? null : (
    <Button asChild variant="outline" className="self-start">
      <Link
        to="/journal/takes/attention"
        search={{ takes: [...takes], feed: row.feed, key: row.key }}
      >
        {takes.length === 0 ? RENDERS_WORDS.open : toTakes(takes.length)}
      </Link>
    </Button>
  )

/** The steps, then the button, for `row`. */
const Steps = ({
  row,
  plan,
  run,
}: {
  row: RenderFailed
  plan: Plan
  run: ReactNode
}): JSX.Element | null => {
  switch (plan.kind) {
    case "ready": {
      return (
        <ol className="flex flex-col gap-4">
          <StepItem tone="todo" mark="1" title={WORDS.run} line={runLine(plan)}>
            {run}
          </StepItem>
        </ol>
      )
    }
    case "takes": {
      const takes = takesStep(plan)
      const open = plan.waiting.length > 0 || !plan.read
      return (
        <ol className="flex flex-col gap-4">
          <StepItem
            tone={takes.done ? "done" : "todo"}
            mark={takes.done ? "✓" : "1"}
            title={takes.title}
            line={takes.line}
          >
            {open && plan.read && <ToTakes row={row} takes={plan.waiting} />}
          </StepItem>
          <StepItem
            tone={canRun(plan) ? "todo" : "wait"}
            mark="2"
            title={WORDS.run}
            line={runLine(plan)}
          >
            {run}
          </StepItem>
        </ol>
      )
    }
    // What the owner can do is said above, by `youLine`: no step here.
    case "elsewhere":
    case "byItself":
    case "preview": {
      return null
    }
    default: {
      return assertNever(plan)
    }
  }
}

type Runtime = ReturnType<typeof createAgain>

/** The page's body for a row on the board. */
const Again = ({
  row,
  runtime,
  state,
  named = true,
}: {
  row: RenderFailed
  runtime: Runtime
  state: AgainState
  /** Whether it names the render: not under the conveyor, which does. */
  named?: boolean
}): JSX.Element => {
  const stop = stopOf(row)
  const attention = useQuery({
    ...againAttentionQuery,
    enabled: stop.kind === "takes-unheard",
  }).data
  const plan = planOf(stop, attention ?? { kind: "unread" }, row.feed)
  const run = (
    <Button
      type="button"
      className="self-start"
      disabled={!canRun(plan) || state.kind === "asking"}
      onClick={() =>
        runtime.dispatch({
          type: "tap",
          target: { feed: row.feed, key: row.key, stoppedAt: row.at },
        })
      }
    >
      {state.kind === "asking" ? WORDS.asking : WORDS.button}
    </Button>
  )
  return (
    <div className="flex flex-col gap-4">
      {named && <p className="text-sm font-medium">{renderName(row)}</p>}
      <WhatHappened row={row} />
      <Steps row={row} plan={plan} run={run} />
    </div>
  )
}

const ToRenders = (): JSX.Element | null =>
  hasAudience("apk") ? (
    <Link to="/journal/renders" className={LINK}>
      {WORDS.toRenders}
    </Link>
  ) : null

/** The row of `board` the page is for, if it still couldn't finish. */
const rowOf = (
  board: Board,
  feed: string,
  key: string
): RenderFailed | undefined =>
  board.failed.find((row) => row.feed === feed && row.key === key)

/**
 * The whole page, for `feed`'s `key`. The tap's runtime is the page's, so
 * what home said stays over the screen once the row leaves the board.
 */
export const RunAgainPage = ({
  feed,
  rowKey,
}: {
  feed: string
  rowKey: string
}): JSX.Element => {
  const client = useQueryClient()
  const [runtime] = useState(() =>
    createAgain({
      ask: runAgainHome,
      readAgain: () => {
        void client.invalidateQueries({ queryKey: rendersQuery.queryKey })
        void client.invalidateQueries({
          queryKey: againAttentionQuery.queryKey,
        })
      },
    })
  )
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  // The step the tap is following, each board read folded into it by the
  // runtime, so a time one read gave is kept by the next.
  const asked = stepOfSaid(state)
  const tappedAt = state.kind === "said" ? state.at : 0
  const query = {
    ...rendersQuery,
    // Followed while the run moves and home answers: the board is read every
    // half minute until it is made or stops, for at most FOLLOW_FOR; a read
    // that failed waits for a pull or Try again, as Renders does.
    refetchInterval: (read: {
      readonly state: Parameters<typeof rendersAgainIn>[0]
    }): number | false => {
      const fresh = Date.now() / 1000 - tappedAt < FOLLOW_FOR
      return read.state.error === null &&
        read.state.data?.kind === "read" &&
        asked !== null &&
        !settled(asked) &&
        fresh
        ? WHILE_UNDER_WAY_MS
        : rendersAgainIn(read.state)
    },
  }
  const board = useQuery(query)
  useEffect(() => {
    if (board.data?.kind === "read")
      runtime.dispatch({ type: "board", board: board.data.board })
  }, [board.data, runtime])
  const notice = state.kind === "said" ? saidLine(state.said) : null
  // How long each step took is said as of the board's last read.
  const readAt = Math.floor(board.dataUpdatedAt / 1000)
  return (
    <StudioPage heading={WORDS.heading}>
      <ReadList query={query} words={RENDERS_WORDS}>
        {(outcome) => {
          if (outcome.kind !== "read")
            return (
              <p className="text-muted-foreground text-sm">
                {outcome.kind === "unpaired"
                  ? RENDERS_WORDS.unpaired
                  : RENDERS_WORDS.older}
              </p>
            )
          const step = asked
          const row = rowOf(outcome.board, feed, rowKey)
          if (step !== null)
            return (
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium">
                  {renderName({ feed, key: rowKey })}
                </p>
                <Conveyor step={step} now={readAt} />
                {/* Stopped again: its steps and the tap once more. */}
                {settled(step) &&
                  step.state !== "done" &&
                  row !== undefined && (
                    <Again
                      row={row}
                      runtime={runtime}
                      state={state}
                      named={false}
                    />
                  )}
              </div>
            )
          return row === undefined ? (
            <p className="text-muted-foreground text-sm">{WORDS.gone}</p>
          ) : (
            <Again row={row} runtime={runtime} state={state} />
          )
        }}
      </ReadList>
      <ToRenders />
      {notice !== null && (
        <Notice
          dismissible
          onDismiss={() => runtime.dispatch({ type: "dismissed" })}
        >
          {notice}
        </Notice>
      )}
    </StudioPage>
  )
}
