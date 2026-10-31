/**
 * Rust Rounds on the phone: open it, stay as long as you like, leave
 * whenever (#2235). The menu, a card (read and choose, speak, see rustc's
 * result; a refine card's earlier note and nudge) and the tutor's page.
 * There is no end screen, nothing counts the time, and nothing is scored.
 *
 * This component only renders and forwards taps. What happens and in what
 * order is `lib/play/machine.ts`; the store, the microphone and the
 * clipboard are `lib/play/runtime.ts`. It owns one runtime for as long as it
 * is mounted (docs/monorepo-boundaries.md, "Inside a React package").
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import type { Card, Round, RustcRun } from "@rust-rounds/lib/formats"
import { programLines, resolvePrograms } from "@rust-rounds/lib/formats"
import {
  conceptsOf,
  locate,
  newRounds,
  playable,
  refinesWaiting,
  runOf,
} from "@rust-rounds/lib/play/held"
import type { PlayIntent, PlayState } from "@rust-rounds/lib/play/machine"
import type { RustRoundsPorts } from "@rust-rounds/lib/play/runtime"
import { createRustRounds } from "@rust-rounds/lib/play/runtime"
import type { Visit } from "@rust-rounds/lib/play/store"
import { runHeading, WORDS } from "@rust-rounds/lib/play/words"
import { Button, CodeCard, HoldButton, Textarea } from "@some-ui/shared"
import { Mic, Pin } from "lucide-react"

export type RustRoundsProps = {
  /** The phone's ports. Read once, on mount. */
  ports: RustRoundsPorts
}

type Dispatch = (intent: PlayIntent) => void

/** Text exactly as printed: kept whole, never wrapped, scrolled sideways. */
const Printed = ({
  label,
  text,
}: {
  label: string
  text: string
}): JSX.Element => (
  <section className="flex min-w-0 flex-col gap-1">
    <h3 className="text-muted-foreground text-xs font-semibold">{label}</h3>
    <pre
      data-scroll-intent="code-display"
      className="bg-muted/40 m-0 min-w-0 overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre"
    >
      {text}
    </pre>
  </section>
)

/** rustc's recorded result, laid out from its JSON, as printed. */
const RunView = ({ run }: { run: RustcRun | null }): JSX.Element => {
  if (run === null) {
    return <p className="text-muted-foreground text-sm">{WORDS.noRun}</p>
  }
  const compiling =
    run.outcome !== "compile-error" && run.compileStderr !== "" ? (
      <Printed label={WORDS.compiling} text={run.compileStderr} />
    ) : null
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{runHeading(run)}</span>
        <span className="text-muted-foreground font-mono text-xs">
          {WORDS.rustcVersion(run.toolchain)}
        </span>
      </p>
      {run.outcome === "compile-error" ? (
        <Printed label={WORDS.rustcPrinted} text={run.stderr} />
      ) : (
        <>
          {compiling}
          {run.stdout === "" ? (
            <p className="text-muted-foreground text-sm">
              {WORDS.printedNothing}
            </p>
          ) : (
            <Printed label={WORDS.printed} text={run.stdout} />
          )}
          {run.outcome !== "prints" && run.stderr !== "" && (
            <Printed label={WORDS.errorOutput} text={run.stderr} />
          )}
        </>
      )}
    </div>
  )
}

/** How the last take on this card ended, in the person's words; null for nothing to say. */
function saidLine(state: PlayState): string | null {
  const { said, notes } = state
  if (said === "blocked") return notes.blocked
  if (said === null || said === "none") return null
  return WORDS.takeEnded[said]
}

/**
 * Hold to speak, let go to keep it. Withdrawn once this card's note is kept,
 * and while the phone has no room for another, rather than shown disabled.
 */
const HoldToSpeak = ({
  state,
  visit,
  dispatch,
}: {
  state: PlayState
  visit: Visit
  dispatch: Dispatch
}): JSX.Element => {
  if (visit.note !== null) {
    return <p className="text-sm font-medium">{WORDS.takeEnded.kept}</p>
  }
  if (state.noRoom) {
    return <p className="text-muted-foreground text-sm">{WORDS.noRoom}</p>
  }
  const { take } = state.notes
  const busy = take.kind !== "idle"
  const said = saidLine(state)
  return (
    <div className="flex flex-col gap-2">
      <HoldButton
        size="lg"
        variant={busy ? "default" : "outline"}
        className="h-16 rounded-2xl text-base font-semibold"
        holding={busy}
        onHold={() => dispatch({ type: "holdToSpeak" })}
        onRelease={() => dispatch({ type: "letGo" })}
      >
        <Mic aria-hidden className="size-5" />
        {take.kind === "keeping"
          ? WORDS.keeping
          : busy
            ? WORDS.listening
            : WORDS.holdToSpeak}
      </HoldButton>
      {said !== null && (
        <p role="status" className="text-muted-foreground text-sm">
          {said}
        </p>
      )}
    </div>
  )
}

/** The program a read or variant card shows, with rustc's span once seen. */
const Program = ({
  round,
  card,
  run,
  seen,
}: {
  round: Round
  card: Exclude<Card, { kind: "refine" }>
  run: RustcRun | null
  seen: boolean
}): JSX.Element => {
  const code = resolvePrograms(round).get(card.id) ?? ""
  const span =
    seen && run?.outcome === "compile-error" && run.span !== null
      ? [run.span]
      : undefined
  const changed =
    card.kind === "variant" && card.hunk.line <= programLines(code).length
      ? [card.hunk.line]
      : undefined
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {card.kind === "variant" && (
        <p className="text-muted-foreground text-xs font-semibold">
          {WORDS.oneLineChanged(card.hunk.line)}
        </p>
      )}
      <CodeCard
        code={code}
        label={WORDS.program}
        changedLines={changed}
        spans={span}
        appearance="code"
      />
    </div>
  )
}

const Actions = ({ children }: { children: ReactNode }): JSX.Element => (
  <div className="flex flex-wrap items-center justify-end gap-2">
    {children}
  </div>
)

const NextButton = ({ dispatch }: { dispatch: Dispatch }): JSX.Element => (
  <Button onClick={() => dispatch({ type: "next" })}>{WORDS.next}</Button>
)

const CardScreen = ({
  state,
  dispatch,
}: {
  state: PlayState
  dispatch: Dispatch
}): JSX.Element | null => {
  const { place } = state
  const located = place && locate(playable(state.held), place.visit)
  if (!place || !located) return null
  const { visit } = place
  const { round, card, number } = located
  const run =
    card.kind === "refine"
      ? null
      : runOf(state.held, { round: visit.round, card: visit.card })

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-semibold">
          {WORDS.cardTitle(round.concept, number)}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={visit.pinned}
          onClick={() => dispatch({ type: "pin" })}
        >
          <Pin aria-hidden className="size-4" />
          {visit.pinned ? WORDS.pinned : WORDS.pin}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch({ type: "menu" })}
        >
          {WORDS.menu}
        </Button>
      </header>
      {visit.again !== "fresh" && (
        <p className="text-muted-foreground -mt-2 text-sm">
          {visit.again === "same" ? WORDS.onlyCard : WORDS.playedBefore}
        </p>
      )}

      {card.kind === "refine" ? (
        <>
          <section className="bg-muted/40 flex flex-col gap-1 rounded-xl p-3">
            <h3 className="text-muted-foreground text-xs font-semibold">
              {WORDS.earlierNote}
            </h3>
            <p className="text-sm">{WORDS.earlierNoteMissing}</p>
          </section>
          <section className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-xs font-semibold">
              {WORDS.fromTutor}
            </h3>
            <p>{card.nudge}</p>
          </section>
          <p className="text-lg font-semibold">
            {WORDS.aim[card.aim]}: {card.say}
          </p>
          <HoldToSpeak state={state} visit={visit} dispatch={dispatch} />
          <Actions>
            <NextButton dispatch={dispatch} />
          </Actions>
        </>
      ) : (
        <>
          <Program
            round={round}
            card={card}
            run={run}
            seen={visit.stage === "see"}
          />
          {visit.stage === "choose" && (
            <>
              <p className="font-semibold">{card.ask}</p>
              <div className="flex flex-col gap-2">
                {card.choices.map((choice) => (
                  <Button
                    key={choice.pick}
                    variant="outline"
                    className="h-auto justify-start py-3 text-left whitespace-normal"
                    onClick={() =>
                      dispatch({ type: "pick", pick: choice.pick })
                    }
                  >
                    {choice.pick}
                  </Button>
                ))}
              </div>
            </>
          )}
          {visit.stage === "speak" && (
            <>
              <section className="flex flex-col gap-1">
                <h3 className="text-muted-foreground text-xs font-semibold">
                  {WORDS.sayThis}
                </h3>
                <p className="text-lg font-semibold">
                  {card.choices.find((choice) => choice.pick === visit.picked)
                    ?.say ?? card.ask}
                </p>
              </section>
              <HoldToSpeak state={state} visit={visit} dispatch={dispatch} />
            </>
          )}
          {visit.stage === "see" && <RunView run={run} />}
          <Actions>
            {visit.stage !== "see" && (
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: "showRustc" })}
              >
                {run === null ? WORDS.skip : WORDS.skipToRustc}
              </Button>
            )}
            <NextButton dispatch={dispatch} />
          </Actions>
        </>
      )}
    </div>
  )
}

const MenuScreen = ({
  state,
  dispatch,
}: {
  state: PlayState
  dispatch: Dispatch
}): JSX.Element => {
  const rounds = playable(state.held)
  // Only what a tutor sent: the worked example is the first round, not news.
  const fresh = newRounds(state.held.rounds, state.log)
  const refines = refinesWaiting(rounds, state.log)
  const { place } = state
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Button
        className="h-14 rounded-2xl text-base whitespace-normal"
        onClick={() => dispatch({ type: "continue" })}
      >
        {place === null
          ? WORDS.start
          : WORDS.continueAt(place.title.concept, place.title.number)}
      </Button>
      {state.noRoom && (
        <p className="text-muted-foreground text-sm">{WORDS.noRoom}</p>
      )}
      {(fresh.length > 0 || refines > 0) && (
        <ul className="flex flex-col gap-1 text-sm">
          {fresh.map((round) => (
            <li key={round.id}>
              {WORDS.newFromTutor(round.concept, round.cards.length)}
            </li>
          ))}
          {refines > 0 && <li>{WORDS.refinesWaiting(refines)}</li>}
        </ul>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-muted-foreground text-sm font-semibold">
          {WORDS.menuHeading}
        </h2>
        <div className="flex flex-wrap gap-2">
          {[null, ...conceptsOf(rounds)].map((concept) => (
            <Button
              key={concept ?? ""}
              variant={
                (place?.menu ?? null) === concept ? "secondary" : "outline"
              }
              onClick={() => dispatch({ type: "play", concept })}
            >
              {concept ?? WORDS.mixed}
            </Button>
          ))}
        </div>
      </section>
      <Actions>
        <Button variant="ghost" onClick={() => dispatch({ type: "tutor" })}>
          {WORDS.tutor}
        </Button>
      </Actions>
    </div>
  )
}

const TutorScreen = ({
  state,
  dispatch,
}: {
  state: PlayState
  dispatch: Dispatch
}): JSX.Element | null => {
  const { screen, copy } = state
  if (screen.kind !== "tutor") return null
  const { answer } = screen
  const copyLine =
    copy.kind === "copying"
      ? WORDS.copying
      : copy.kind === "copied"
        ? copy.what === "fix"
          ? WORDS.fixCopied
          : WORDS.copied
        : copy.kind === "failed"
          ? WORDS.copyFailed
          : null
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Button
        className="h-12 rounded-2xl"
        onClick={() => dispatch({ type: "copyLog" })}
      >
        {WORDS.copyForTutor}
      </Button>
      {copyLine !== null && (
        <p role="status" className="text-muted-foreground text-sm">
          {copyLine}
        </p>
      )}
      {copy.kind === "failed" && (
        <details>
          <summary className="text-sm">{WORDS.showText}</summary>
          <pre
            data-scroll-intent="long-form"
            className={
              // scroll-intent: long-form — the whole copy, shown only when
              // the clipboard refused it, for the thumb to select.
              "bg-muted/40 m-0 max-h-64 min-w-0 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre select-all"
            }
          >
            {copy.text}
          </pre>
        </details>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {WORDS.replyLabel}
        <Textarea
          value={screen.reply}
          rows={5}
          className="font-mono text-xs"
          onChange={(event) =>
            dispatch({ type: "reply", text: event.target.value })
          }
        />
      </label>
      {answer !== null && (
        <p role="status" className="text-sm">
          {answer.kind === "empty"
            ? WORDS.replyEmpty
            : answer.kind === "taken"
              ? WORDS.replyTaken(answer.concept, answer.cards)
              : answer.kind === "already-here"
                ? WORDS.replyAlreadyHere
                : WORDS.replyRefused}
        </p>
      )}
      <Actions>
        {answer?.kind === "refused" && (
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "copyFix" })}
          >
            {WORDS.copyFix}
          </Button>
        )}
        <Button onClick={() => dispatch({ type: "takeReply" })}>
          {WORDS.takeReply}
        </Button>
      </Actions>
      <Actions>
        <Button variant="ghost" onClick={() => dispatch({ type: "continue" })}>
          {WORDS.backToCards}
        </Button>
      </Actions>
    </div>
  )
}

/** The session, with one runtime over `ports` for as long as it shows. */
export const RustRounds = ({ ports }: RustRoundsProps): JSX.Element => {
  // The runtime owns the store, the microphone and the clipboard for this
  // mount, so it is made once, from the ports it arrived with.
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount (see above) */
  const [runtime] = useState(() => createRustRounds(ports))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { dispatch } = runtime

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{WORDS.title}</h1>
      {Object.values(state.notKept).some(Boolean) && (
        <p role="alert" className="text-destructive text-sm">
          {WORDS.notKept}
        </p>
      )}
      {state.lost !== null && (
        <p role="alert" className="text-destructive text-sm">
          {WORDS.noteLost(state.lost.concept, state.lost.number)}
        </p>
      )}
      {state.screen.kind === "menu" && (
        <MenuScreen state={state} dispatch={dispatch} />
      )}
      {state.screen.kind === "card" && (
        <CardScreen state={state} dispatch={dispatch} />
      )}
      {state.screen.kind === "tutor" && (
        <TutorScreen state={state} dispatch={dispatch} />
      )}
    </div>
  )
}
