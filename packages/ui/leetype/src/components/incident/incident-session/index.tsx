import type { FC, JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { Glosses } from "@leetype/components/incident/glosses"
import { ParkedRounds } from "@leetype/components/incident/parked-rounds"
import { ReadingScreenView } from "@leetype/components/incident/reading-screen"
import { RecordScreenView } from "@leetype/components/incident/record-screen"
import { RoundScreen } from "@leetype/components/incident/round-screen"
import { SessionEnd } from "@leetype/components/incident/session-end"
import { SessionStart } from "@leetype/components/incident/session-start"
import type {
  IncidentPlayPorts,
  TakeParked,
} from "@leetype/lib/leetype/incident-play"
import {
  declaredMinutes,
  IncidentPlayRuntime,
  pageVisibility,
  returnFrom,
} from "@leetype/lib/leetype/incident-play"
import {
  endLines,
  parkedRounds,
  placeOf,
} from "@leetype/lib/leetype/incident-play/words"
import type { ParkedRound } from "@leetype/lib/leetype/incident-play/words"
import {
  createSessionLogStore,
  ledgerOf,
} from "@leetype/lib/leetype/session-log"
import type { SessionFile } from "@leetype/types/session-file"
import { assertNever, cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"

type IncidentSessionProps = {
  /** The file's name, as the session log names it. */
  fileName: string
  file: SessionFile
  /** Read once, at mount: the runtime is made once per session. */
  ports?: Partial<IncidentPlayPorts>
  /** The most the host's time leaves, in minutes: the length is no longer. */
  limitMinutes?: number
  /** The learner is done with an ended session: by its end screen, or by leaving. */
  onEnd?: (how: "declared" | "left") => void
  /** The learner leaves the first screen without starting. */
  onBack?: () => void
  className?: string
}

/**
 * A phone session played from a session file (canon v1.2): its first screen
 * with the declared length and the short form (Prop. 9.6), then one screen
 * at a time, each step recorded in the session log, then the end screen
 * computed from that log (Prop. 10.2). It reads the runtime's snapshot and
 * dispatches; the clock, the ids and the log live in the runtime
 * (`lib/leetype/incident-play`).
 */
export const IncidentSession: FC<IncidentSessionProps> = ({
  fileName,
  file,
  ports,
  limitMinutes,
  onEnd,
  onBack,
  className,
}) => {
  const [{ runtime, log }] = useState(() => {
    const kept = ports?.log ?? createSessionLogStore()
    return {
      log: kept,
      runtime: new IncidentPlayRuntime({
        log: kept,
        now: ports?.now ?? ((): number => Date.now()),
        newId: ports?.newId ?? ((): string => crypto.randomUUID()),
        visibility: ports?.visibility ?? pageVisibility,
        ...(ports?.takes === undefined ? {} : { takes: ports.takes }),
        ...(ports?.after === undefined ? {} : { after: ports.after }),
      }),
    }
  })
  const { play, problem, take, timeUp } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )
  useEffect(() => runtime.attach(), [runtime])
  // Whether the rounds waiting on a reading are open during play.
  const [waiting, setWaiting] = useState(false)
  const ended = play?.ended ?? null
  const page =
    // scroll-intent: reading-page: a round is one scrolling screen
    // (Def. 9.3); the page scrolls and the job stays pinned.
    "flex h-full flex-col overflow-y-auto px-4 pb-6"

  const limit = limitMinutes === undefined ? {} : { limitMinutes }
  const here = { fileName, file }
  const kept = log.getSnapshot().log
  const parked = parkedRounds(kept, here).flatMap((round) => {
    const screen = file.screens[round.round]
    return screen?.type === "choice" || screen?.type === "record"
      ? [{ ...round, screen }]
      : []
  })
  // Taken before its reading was read, a return is asked for (Prop. 9.4 (d)).
  const taken = (
    { round, reading, read }: ParkedRound,
    take: "return" | "round"
  ): TakeParked => ({ round, reading, take, asked: !read })

  if (play === null) {
    return (
      <div data-scroll-intent="reading-page" className={cn(page, className)}>
        <SessionStart
          title={file.title}
          oneLine={file.oneLine}
          place={placeOf(kept, here)}
          fullMinutes={declaredMinutes(file, "full", false, limitMinutes)}
          shortMinutes={declaredMinutes(file, "short", false, limitMinutes)}
          parked={parked}
          onStart={(form): void =>
            runtime.start({ fileName, file, form, ...limit })
          }
          onRound={(round, take): void =>
            runtime.start({
              fileName,
              file,
              form: "short",
              ...limit,
              from: taken(round, take),
            })
          }
          onConfirmation={({ round }): void =>
            runtime.takeConfirmation(fileName, round)
          }
          {...(onBack === undefined ? {} : { onBack })}
        />
      </div>
    )
  }
  const screen = play.file.screens[play.screen]
  const dispatch = runtime.dispatch
  // A round boundary: no reveal and no spoken answer before its rubric.
  const boundary =
    ended === null && play.reveal === null && play.spoken === null

  const body = ((): JSX.Element | null => {
    if (ended !== null || screen === undefined) {
      return (
        <div className="flex flex-col gap-4">
          <SessionEnd
            lines={endLines(ledgerOf(log.getSnapshot().log, play.session), {
              fileName,
              file,
            })}
          />
          {ended !== null && onEnd !== undefined && (
            <Button
              className="min-h-11 self-start"
              onClick={(): void => onEnd(ended)}
            >
              Done
            </Button>
          )}
        </div>
      )
    }
    switch (screen.type) {
      case "choice": {
        return (
          <RoundScreen
            screen={screen}
            glossary={play.file.glossary ?? {}}
            reveal={play.reveal}
            onPick={(option): void => dispatch({ type: "pick", option })}
            onContinue={(): void => dispatch({ type: "continue" })}
            onShowConfirmation={(): void =>
              dispatch({ type: "show-confirmation" })
            }
          />
        )
      }
      case "reading": {
        return (
          <ReadingScreenView
            screen={screen}
            glossary={play.file.glossary ?? {}}
            offered={play.placement?.as ?? null}
            canAskReturn={returnFrom(play) !== null}
            onAct={(action): void => dispatch({ type: "act", action })}
            onOpenSource={(): void => dispatch({ type: "open-source" })}
            onAskReturn={(): void => dispatch({ type: "ask-return" })}
          />
        )
      }
      case "record": {
        return (
          <RecordScreenView
            screen={screen}
            glossary={play.file.glossary ?? {}}
            spoken={play.spoken}
            take={take}
            onRecordStart={runtime.record}
            onRecordStop={runtime.stopRecording}
            onTyped={(text): void =>
              dispatch({ type: "answered", answer: { as: "typed", text } })
            }
            onPass={(): void => dispatch({ type: "pass" })}
            onTicked={(ticks): void => dispatch({ type: "ticked", ticks })}
          />
        )
      }
      case "info":
      case "end": {
        return (
          <article className="flex flex-col gap-4">
            {screen.pinned !== undefined && (
              <p className="sticky top-0 z-10 -mx-4 border-b border-border bg-background px-4 py-2 text-pretty text-sm font-medium text-foreground">
                {screen.pinned}
              </p>
            )}
            {screen.title !== undefined && (
              <h2 className="text-pretty text-base font-semibold text-foreground">
                {screen.title}
              </h2>
            )}
            {screen.body !== undefined && (
              <p className="whitespace-pre-line text-pretty text-sm leading-relaxed text-foreground">
                {screen.body}
              </p>
            )}
            <Glosses
              terms={screen.glosses}
              glossary={play.file.glossary ?? {}}
            />
            {(screen.actions ?? []).map((action, index) => (
              <Button
                key={`${String(index)} ${action.label}`}
                className="h-auto min-h-11 self-start whitespace-normal text-pretty py-2"
                onClick={(): void => dispatch({ type: "act", action: index })}
              >
                {action.label}
              </Button>
            ))}
          </article>
        )
      }
      default: {
        return assertNever(screen)
      }
    }
  })()

  return (
    // Keyed by screen: each opens at its top, not where the last was left.
    <div
      key={`${play.screen} ${ended ?? ""}`}
      data-scroll-intent="reading-page"
      className={cn(page, className)}
    >
      <header className="flex items-center justify-between gap-3 py-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {play.file.title}
        </p>
        {boundary && (
          <div className="flex shrink-0 gap-1">
            {parked.length > 0 && (
              <Button
                variant="ghost"
                className="min-h-11"
                aria-expanded={waiting}
                onClick={(): void => setWaiting((now) => !now)}
              >
                Rounds waiting
              </Button>
            )}
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={(): void => dispatch({ type: "leave" })}
            >
              End here
            </Button>
          </div>
        )}
      </header>
      {boundary && waiting && (
        <div className="pb-4">
          <ParkedRounds
            parked={parked}
            inView={play.screen}
            onRound={(round, take): void => {
              setWaiting(false)
              dispatch({ type: "take-parked", ...taken(round, take) })
            }}
            onConfirmation={({ round }): void =>
              runtime.takeConfirmation(fileName, round)
            }
          />
        </div>
      )}
      {timeUp && ended === null && (
        <p
          role="status"
          className="pb-2 text-pretty text-sm text-muted-foreground"
        >
          That is the time you set. End here to see where you are, or go on.
        </p>
      )}
      {problem !== null && (
        <p role="alert" className="pb-2 text-sm text-destructive">
          {problem}
        </p>
      )}
      {body}
    </div>
  )
}
