/**
 * One question of the week's opening, a page of the flow's pager (#3269;
 * the owner's approved prototype, and their words of 2026-11-19: "once a
 * recording is in place, you can keep reusing it or re-record it"):
 *
 * - **Their question above, the answer below** through the shared
 *   teleprompter (`Teleprompter`, `@some-ui/shared`), its band moved by the
 *   level of the take under way (`lib/week-play/runtime`'s opening).
 * - **The take in place, said plainly:** home's, from when, which week and
 *   how long, played from home; or one said this week, on this phone; or
 *   none; or "not known yet" until home's record answers
 *   (`lib/week-play/opening`'s `openingPlace`).
 * - **Use this one** is the way on with a take in place, beside **Record
 *   again**, which adds a take and keeps the earlier. A recording ends with
 *   **Stop** (`OPENING_TAKE_WORDS`).
 *
 * It renders the runtimes' snapshots and forwards taps; every word is
 * `lib/week-play/words`' `flow.opening`.
 */
import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import type { FlowRuntime } from "@rust-rounds/lib/week-play/flow-runtime"
import type { OpeningPlace } from "@rust-rounds/lib/week-play/opening"
import {
  hereTake,
  inPlace,
  openingPlace,
} from "@rust-rounds/lib/week-play/opening"
import { openingItem } from "@rust-rounds/lib/week-play/points"
import type { OpeningRuntime } from "@rust-rounds/lib/week-play/runtime"
import type { WeekKind, WeekState } from "@rust-rounds/lib/week-play/spec"
import {
  OPENING_TAKE_WORDS,
  WEEK_WORDS,
} from "@rust-rounds/lib/week-play/words"
import {
  bandOf,
  BundleTake,
  Button,
  Notice,
  Teleprompter,
} from "@some-ui/shared"
import type {
  BundleIntent,
  BundleMachine,
  BundleTakes,
  TakePatternSnapshot,
} from "@some-ui/voice-capture"
import { TAKE_WORDS } from "@some-ui/voice-capture"

const WORDS = WEEK_WORDS
const OPENING = WEEK_WORDS.flow.opening

export type OpeningPageProps = {
  readonly machine: BundleMachine<WeekKind>
  readonly state: WeekState
  readonly takes: BundleTakes
  readonly snapshot: TakePatternSnapshot
  readonly dispatch: (intent: BundleIntent<WeekKind>) => void
  readonly flow: FlowRuntime
  readonly opening: OpeningRuntime
  /** The question, from 1. */
  readonly n: number
  readonly ask: string
  readonly script: string
}

/** Home's take: what it is, and Play from home. */
const HomeTake = ({
  place,
  opening,
}: {
  place: Extract<OpeningPlace, { kind: "home" }>
  opening: OpeningRuntime
}): JSX.Element => {
  const { playback } = useSyncExternalStore(
    opening.subscribe,
    opening.getSnapshot
  )
  const mine = playback.kind !== "idle" && playback.take === place.take
  const playing = mine && playback.kind === "playing"
  const asking = mine && playback.kind === "asking"
  const missed = mine && playback.kind === "missed"
  return (
    <section
      data-opening-take="home"
      className="bg-card border-border flex flex-col gap-2 rounded-2xl border p-3"
    >
      <p className="text-muted-foreground text-xs font-semibold">
        {OPENING.inPlace}
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => opening.play(place.take)}
          aria-pressed={playing}
        >
          {playing || asking ? OPENING.stop : OPENING.play}
        </Button>
        <p className="min-w-0 flex-1 text-sm">
          {OPENING.fromHome(
            TAKE_WORDS.when(place.recordedAt),
            place.week,
            place.ms
          )}
          <span className="text-muted-foreground block text-xs">
            {asking ? OPENING.asking : OPENING.onHome}
          </span>
        </p>
      </div>
      {missed && (
        // Said over the screen, so the page holds still (HS1).
        <Notice
          action={{
            label: OPENING.playAgain,
            onClick: () => opening.play(place.take),
          }}
          onDismiss={opening.stop}
        >
          {OPENING.missed}
        </Notice>
      )}
    </section>
  )
}

export const OpeningPage = (props: OpeningPageProps): JSX.Element => {
  const { machine, state, takes, snapshot, dispatch, flow, opening, n } = props
  const view = useSyncExternalStore(opening.subscribe, opening.getSnapshot)
  const item = openingItem(n)
  const line = machine.answersOf(state, item)
  const lines = props.script.split("\n")
  const take = snapshot.take
  const reading = take.kind === "recording" && snapshot.answers === line
  const recording = state.busy
  const place = openingPlace(
    n,
    opening.spec.version,
    view.home,
    hereTake(state.takes, line)
  )
  const using = inPlace(place)
  return (
    <>
      {!recording && <p className="text-sm">{OPENING.line}</p>}
      <section className="bg-muted flex flex-col gap-0.5 rounded-2xl px-3 py-2">
        <p className="text-muted-foreground text-xs">{OPENING.theyAsk}</p>
        <p className="font-semibold [overflow-wrap:anywhere]">{props.ask}</p>
      </section>
      <Teleprompter
        lines={lines}
        band={bandOf(view.prompter, line, lines)}
        reading={reading}
        level={reading ? take.level : 0}
        time={reading ? OPENING.time(take.elapsedMs) : null}
        pace={view.pace}
        words={{
          script: OPENING.script,
          ready: OPENING.ready,
          band: OPENING.band,
          pause: OPENING.pause,
          goOn: OPENING.goOn,
          slower: OPENING.slower,
          faster: OPENING.faster,
          pace: OPENING.pace,
        }}
        dataScript={item}
        onPause={opening.pause}
        onPace={opening.setPace}
      />
      {!recording && place.kind === "home" && (
        <HomeTake place={place} opening={opening} />
      )}
      {!recording && place.kind === "unknown" && (
        <p
          data-opening-take="unknown"
          className="text-muted-foreground text-sm"
        >
          {OPENING.unknown}
        </p>
      )}
      {!recording && place.kind === "none" && (
        <p data-opening-take="none" className="text-muted-foreground text-sm">
          {OPENING.none}
        </p>
      )}
      {!recording && using && (
        <Button
          size="lg"
          onClick={() => flow.dispatch({ type: "leave", how: "onward" })}
        >
          {OPENING.use}
        </Button>
      )}
      <BundleTake
        machine={machine}
        state={state}
        takes={takes}
        snapshot={snapshot}
        dispatch={dispatch}
        words={WORDS}
        item={item}
        head={null}
        takeWords={
          place.kind === "home"
            ? {
                ...OPENING_TAKE_WORDS,
                button: {
                  ...OPENING_TAKE_WORDS.button,
                  ready: OPENING.again,
                },
              }
            : OPENING_TAKE_WORDS
        }
      />
      {!recording && place.kind === "home" && (
        <p className="text-muted-foreground text-xs">{OPENING.keepsEarlier}</p>
      )}
      {!recording && place.kind === "here" && (
        <p className="text-muted-foreground text-xs">{OPENING.here}</p>
      )}
      {!recording && !using && (
        <Button
          variant="ghost"
          onClick={() => flow.dispatch({ type: "leave", how: "onward" })}
        >
          {OPENING.notThisWeek}
        </Button>
      )}
    </>
  )
}
