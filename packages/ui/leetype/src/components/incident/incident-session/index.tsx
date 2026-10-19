import type { FC, JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { ReadingScreenView } from "@leetype/components/incident/reading-screen"
import { RecordScreenView } from "@leetype/components/incident/record-screen"
import { RoundScreen } from "@leetype/components/incident/round-screen"
import { SessionEnd } from "@leetype/components/incident/session-end"
import { SessionStart } from "@leetype/components/incident/session-start"
import type { IncidentPlayPorts } from "@leetype/lib/leetype/incident-play"
import {
  IncidentPlayRuntime,
  returnFrom,
  SHORT_FORM_MINUTES,
} from "@leetype/lib/leetype/incident-play"
import {
  endLines,
  placeOf,
  returnsReady,
} from "@leetype/lib/leetype/incident-play/words"
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
  /** The learner is done with an ended session: by its end screen, or by leaving. */
  onEnd?: (how: "declared" | "left") => void
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
  onEnd,
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
        ...(ports?.takes === undefined ? {} : { takes: ports.takes }),
      }),
    }
  })
  const { play, problem, take } = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSnapshot,
    runtime.getSnapshot
  )
  useEffect(() => runtime.close, [runtime])
  const ended = play?.ended ?? null
  const page =
    // scroll-intent: reading-page: a round is one scrolling screen
    // (Def. 9.3); the page scrolls and the job stays pinned.
    "flex h-full flex-col overflow-y-auto px-4 pb-6"

  if (play === null) {
    const here = { fileName, file }
    const kept = log.getSnapshot().log
    return (
      <div data-scroll-intent="reading-page" className={cn(page, className)}>
        <SessionStart
          title={file.title}
          oneLine={file.oneLine}
          place={placeOf(kept, here)}
          fullMinutes={file.session.budgetMinutes}
          shortMinutes={SHORT_FORM_MINUTES}
          returns={returnsReady(kept, here)}
          onStart={(form): void => runtime.start({ fileName, file, form })}
          onReturn={({ round, reading }): void =>
            runtime.start({
              fileName,
              file,
              form: "full",
              returning: { round, reading },
            })
          }
        />
      </div>
    )
  }
  const screen = play.file.screens[play.screen]
  const dispatch = runtime.dispatch

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
            <Button className="self-start" onClick={(): void => onEnd(ended)}>
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
            key={play.screen}
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
            key={play.screen}
            screen={screen}
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
            key={play.screen}
            screen={screen}
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
          <article key={play.screen} className="flex flex-col gap-4">
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
            {(screen.actions ?? []).map((action, index) => (
              <Button
                key={action.label}
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
    <div data-scroll-intent="reading-page" className={cn(page, className)}>
      <header className="flex items-center justify-between gap-3 py-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {play.file.title}
        </p>
        {ended === null && play.reveal === null && play.spoken === null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(): void => dispatch({ type: "leave" })}
          >
            End here
          </Button>
        )}
      </header>
      {problem !== null && (
        <p role="alert" className="pb-2 text-sm text-destructive">
          {problem}
        </p>
      )}
      {body}
    </div>
  )
}
