/**
 * Game day on the phone: tap what is happening and say it. One tap opens the
 * microphone, a quiet moment (or Done, or the minute) stops it, and the bite
 * is kept on the phone at once, waiting there until home holds it.
 *
 * This component only renders and forwards taps. What happens and in what
 * order is `lib/machine.ts`; the microphone, the store and home's feed are
 * `lib/runtime.ts`. It owns one runtime for as long as it is mounted
 * (docs/monorepo-boundaries.md, "Inside a React package"). The legend and
 * the modes open in the shared sheet over this screen: which is open is the
 * screen's own, and nothing outside it depends on it.
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import type { Said } from "@game-week/lib/bite"
import type { Game, JustHappened, OfferCard } from "@game-week/lib/feed"
import type { Activity, GameWeekState, OfferView } from "@game-week/lib/machine"
import { currentGame, isWatching, offerView } from "@game-week/lib/machine"
import type { ModeId } from "@game-week/lib/modes"
import { BITE_LIMITS, MODE_RULES, MODES } from "@game-week/lib/modes"
import type { OutboxPort } from "@game-week/lib/ports"
import { quietFill } from "@game-week/lib/quiet"
import type { GameWeekPorts } from "@game-week/lib/runtime"
import { createGameWeek } from "@game-week/lib/runtime"
import {
  ago,
  clock,
  MINUTE_LINE,
  MODE_WORDS,
  noGamesLine,
  noOfferLine,
  outboxLine,
  WORDS,
} from "@game-week/lib/words"
import { cn } from "@some-ui/core-utils"
import type { ScenarioId } from "@some-ui/game-scenarios"
import {
  PHASE_TITLES,
  PHASES,
  scenarioOf,
  SCENARIOS,
} from "@some-ui/game-scenarios"
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@some-ui/shared"
import { RECORDING_FAILURE_COPY } from "@some-ui/voice-capture"
import { Eye, EyeOff, List, Mic, Settings2 } from "lucide-react"

import { ScenarioIcon } from "./scenario-icon"

export type GameWeekProps = {
  /** The phone's ports. Read once, on mount. */
  ports: GameWeekPorts
  /** What of the kept bites is still only on this phone. */
  outbox: OutboxPort
}

type Panel = "none" | "legend" | "modes"

const SfBadge = (): JSX.Element => (
  <span className="bg-brand text-brand-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-black tracking-tight">
    {WORDS.team}
  </span>
)

const GamePicker = ({
  games,
  current,
  state,
  onPick,
  onToggle,
}: {
  games: ReadonlyArray<Game>
  current: Game
  state: GameWeekState
  onPick: (id: string) => void
  onToggle: (id: string) => void
}): JSX.Element => (
  <ul aria-label={WORDS.pickGame} className="flex gap-2 overflow-x-auto pb-1">
    {games.map((game) => {
      const watching = isWatching(state.prefs, game.id)
      const picked = game.id === current.id
      return (
        <li
          key={game.id}
          className={cn(
            "border-border/60 flex shrink-0 items-center gap-1 rounded-2xl border",
            picked && "border-brand bg-brand/10"
          )}
        >
          <button
            type="button"
            aria-pressed={picked}
            onClick={() => onPick(game.id)}
            className="flex flex-col items-start px-3 py-1.5 text-left"
          >
            <span className="text-sm font-bold uppercase tracking-wide">
              {game.label}
            </span>
            <span className="text-muted-foreground text-xs">{game.want}</span>
          </button>
          <button
            type="button"
            onClick={() => onToggle(game.id)}
            aria-pressed={watching}
            aria-label={`${game.label}: ${watching ? WORDS.watching : WORDS.notWatching}`}
            className="text-muted-foreground hover:text-foreground pr-3"
          >
            {watching ? (
              <Eye className="size-4" aria-hidden />
            ) : (
              <EyeOff className="size-4" aria-hidden />
            )}
          </button>
        </li>
      )
    })}
  </ul>
)

const Card = ({
  card,
  large,
  onSay,
}: {
  card: OfferCard
  large: boolean
  onSay: () => void
}): JSX.Element => (
  <button
    type="button"
    onClick={onSay}
    className={cn(
      "bg-card border-border/50 flex w-full items-center gap-3 rounded-2xl border text-left shadow-sm active:scale-[0.98]",
      large ? "p-4" : "p-3"
    )}
  >
    <ScenarioIcon
      id={card.scenario}
      className={cn("text-brand", large ? "size-10" : "size-6")}
    />
    <span className="min-w-0">
      <span
        className={cn(
          "block font-bold uppercase tracking-wide",
          large ? "text-lg" : "text-sm"
        )}
      >
        {scenarioOf(card.scenario).name}
      </span>
      <span className="text-muted-foreground block truncate text-xs">
        {card.context}
      </span>
    </span>
  </button>
)

const JustHappenedRow = ({
  each,
  now,
  onSay,
}: {
  each: JustHappened
  now: number
  onSay: () => void
}): JSX.Element => (
  <li>
    <button
      type="button"
      onClick={onSay}
      className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
    >
      <ScenarioIcon id={each.scenario} className="text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {scenarioOf(each.scenario).name}
        </span>
        <span className="text-muted-foreground block truncate text-xs">
          {each.context}
        </span>
      </span>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {ago(now - Date.parse(each.at))}
      </span>
    </button>
  </li>
)

const offered = (card: OfferCard): Said => ({
  how: "offered",
  scenario: card.scenario,
  context: card.context,
})

const happened = (each: JustHappened): Said => ({
  how: "just-happened",
  scenario: each.scenario,
  context: each.context,
})

const everyScenario = (scenario: ScenarioId): Said => ({
  how: "every-scenario",
  scenario,
  context: "",
})

/** The cards and what just happened, each starting (or naming) a bite. */
const Offers = ({
  view,
  now,
  onSay,
}: {
  view: OfferView
  now: number
  onSay: (said: Said) => void
}): JSX.Element => {
  const [first, ...rest] = view.cards
  return (
    <div className="space-y-3">
      {first && (
        <section aria-label={WORDS.likeliest} className="space-y-2">
          <Card card={first} large onSay={() => onSay(offered(first))} />
          {rest.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {rest.map((card) => (
                <Card
                  key={card.scenario}
                  card={card}
                  large={false}
                  onSay={() => onSay(offered(card))}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {view.justHappened.length > 0 && (
        <section aria-labelledby="just-happened" className="space-y-1">
          <h2
            id="just-happened"
            className="text-muted-foreground text-xs font-bold tracking-wide uppercase"
          >
            {WORDS.justHappened}
          </h2>
          <ul>
            {view.justHappened.map((each) => (
              <JustHappenedRow
                key={`${each.scenario}:${each.at}`}
                each={each}
                now={now}
                onSay={() => onSay(happened(each))}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const Recording = ({
  activity,
  now,
  onDone,
}: {
  activity: Extract<Activity, { kind: "recording" | "opening" | "finishing" }>
  now: number
  onDone: () => void
}): JSX.Element => {
  const recording = activity.kind === "recording"
  const level = recording ? activity.level : 0
  const elapsed = recording ? activity.elapsed : 0
  const fill = recording
    ? quietFill(activity.quiet, now, MODE_RULES[activity.moment.mode].quietMs)
    : 0
  const { said } = activity
  return (
    <section
      aria-label={
        said.how === "said-first" ? WORDS.sayingFirst : WORDS.recordingLabel
      }
      className="flex flex-col items-center gap-5 py-4"
    >
      <span
        className="ring-destructive bg-destructive/10 flex size-36 items-center justify-center rounded-full ring-4 transition-transform duration-100"
        style={{ transform: `scale(${1 + level * 0.1})` }}
      >
        {said.how === "said-first" ? (
          <Mic className="size-16" aria-hidden />
        ) : (
          <ScenarioIcon id={said.scenario} className="size-16" />
        )}
      </span>
      <p className="text-lg font-bold uppercase tracking-wide">
        {said.how === "said-first"
          ? WORDS.sayingFirst
          : scenarioOf(said.scenario).name}
      </p>
      <div className="flex w-full max-w-xs items-center gap-3">
        <div
          role="meter"
          aria-label="Level"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={level}
          className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
        >
          <div
            className="bg-brand h-full transition-[width] duration-100"
            style={{ width: `${level * 100}%` }}
          />
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {clock(elapsed)} / {clock(BITE_LIMITS.maxMs)}
        </span>
      </div>
      <div className="w-full max-w-xs space-y-1">
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-warning h-full"
            style={{ width: `${fill * 100}%` }}
          />
        </div>
        <p className="text-muted-foreground text-center text-xs">
          {WORDS.quietBar}
        </p>
      </div>
      <Button
        size="lg"
        onClick={onDone}
        disabled={!recording}
        className="h-16 w-full max-w-xs rounded-full text-xl font-bold"
      >
        {WORDS.done}
      </Button>
    </section>
  )
}

const Asking = ({
  view,
  now,
  canUndo,
  onAnswer,
  onUndo,
  onLegend,
}: {
  view: OfferView | null
  now: number
  canUndo: boolean
  onAnswer: (said: Said | null) => void
  onUndo: () => void
  onLegend: () => void
}): JSX.Element => (
  <section aria-labelledby="asking" className="space-y-4">
    <h2 id="asking" className="text-xl font-bold uppercase tracking-wide">
      {WORDS.askTitle}
    </h2>
    {view !== null && <Offers view={view} now={now} onSay={onAnswer} />}
    <Button
      variant="outline"
      className="h-auto w-full py-3 whitespace-normal"
      onClick={() => onAnswer(null)}
    >
      {WORDS.later}
    </Button>
    <div className="flex justify-between">
      <Button variant="ghost" size="sm" onClick={onLegend}>
        <List className="size-4" aria-hidden /> {WORDS.everyScenario}
      </Button>
      {canUndo && (
        <Button variant="ghost" size="sm" onClick={onUndo}>
          {WORDS.undo}
        </Button>
      )}
    </div>
  </section>
)

const Legend = ({
  onPick,
}: {
  onPick: (scenario: ScenarioId) => void
}): JSX.Element => (
  <div className="space-y-4">
    <p className="text-muted-foreground text-sm">{WORDS.legendLede}</p>
    {PHASES.map((phase) => (
      <section
        key={phase}
        aria-label={PHASE_TITLES[phase]}
        className="space-y-1"
      >
        <h3 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          {PHASE_TITLES[phase]}
        </h3>
        <ul>
          {SCENARIOS.filter((s) => s.phase === phase).map((scenario) => (
            <li key={scenario.id}>
              <button
                type="button"
                onClick={() => onPick(scenario.id)}
                className="hover:bg-accent flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left"
              >
                <ScenarioIcon id={scenario.id} className="text-brand" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {scenario.name}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {scenario.covers}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </div>
)

const Modes = ({
  state,
  onPick,
}: {
  state: GameWeekState
  onPick: (mode: ModeId) => void
}): JSX.Element => (
  <div className="space-y-3">
    {MODES.map((mode) => {
      const words = MODE_WORDS[mode]
      const picked = state.prefs.mode === mode
      return (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={picked}
          onClick={() => onPick(mode)}
          className={cn(
            "border-border/60 w-full space-y-1 rounded-2xl border p-4 text-left",
            picked && "border-brand bg-brand/10"
          )}
        >
          <span className="block font-bold">{words.name}</span>
          <span className="text-muted-foreground block text-sm">
            {words.lede}
          </span>
          <ul className="text-muted-foreground list-disc pl-5 text-xs">
            {words.rows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </button>
      )
    })}
    <p className="text-muted-foreground text-xs">{MINUTE_LINE}</p>
  </div>
)

export const GameWeek = ({ ports, outbox }: GameWeekProps): JSX.Element => {
  // The runtime owns the microphone, the store and home's feed for this
  // mount, so it is made once, from the ports it arrived with.
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount (see above) */
  const [runtime] = useState(() => createGameWeek(ports))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const waiting = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot)
  const [panel, setPanel] = useState<Panel>("none")
  const { dispatch } = runtime
  const { activity, now } = state

  const game = currentGame(state)
  const view = offerView(state)
  const asking = activity.kind === "asking"
  const say = (said: Said): void => dispatch({ type: "say", said })
  const pickFromLegend = (scenario: ScenarioId): void => {
    setPanel("none")
    const said = everyScenario(scenario)
    dispatch(asking ? { type: "answer", said } : { type: "say", said })
  }
  const outboxWords = outboxLine(waiting)

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-8">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <SfBadge />
          <h1 className="min-w-0 flex-1 truncate text-2xl font-black tracking-tight uppercase">
            {game?.label ?? WORDS.team}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPanel("legend")}
            aria-label={WORDS.everyScenario}
          >
            <List className="size-5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPanel("modes")}
            aria-label={WORDS.settingsTitle}
          >
            <Settings2 className="size-5" aria-hidden />
          </Button>
        </div>
        {game !== null && (
          <GamePicker
            games={state.games}
            current={game}
            state={state}
            onPick={(gameId) => dispatch({ type: "pickGame", gameId })}
            onToggle={(gameId) => dispatch({ type: "toggleWatching", gameId })}
          />
        )}
        {view !== null && view.strip !== "" && (
          <p className="bg-muted rounded-xl px-3 py-2 text-sm font-semibold tabular-nums">
            {view.strip}
          </p>
        )}
      </header>

      {activity.kind === "opening" ||
      activity.kind === "recording" ||
      activity.kind === "finishing" ? (
        <Recording
          activity={activity}
          now={now}
          onDone={() => dispatch({ type: "done" })}
        />
      ) : asking ? (
        <Asking
          view={activity.offer}
          now={now}
          canUndo={state.undo?.id === activity.bite.id}
          onAnswer={(said) => dispatch({ type: "answer", said })}
          onUndo={() => dispatch({ type: "undo" })}
          onLegend={() => setPanel("legend")}
        />
      ) : game === null ? (
        <p className="text-muted-foreground text-sm">
          {noGamesLine(state.link)}
        </p>
      ) : (
        <>
          {view === null ? (
            <p className="text-muted-foreground text-sm">
              {noOfferLine(state.link)}
            </p>
          ) : (
            <Offers view={view} now={now} onSay={say} />
          )}
          <section className="flex flex-col items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => say({ how: "said-first" })}
              aria-label={WORDS.sayItFirst}
              className="bg-brand text-brand-foreground focus-visible:ring-ring flex size-32 items-center justify-center rounded-full shadow-lg focus-visible:ring-2 focus-visible:outline-none active:scale-95"
            >
              <Mic className="size-14" aria-hidden />
            </button>
            <p className="text-base font-bold uppercase tracking-wide">
              {WORDS.sayItFirst}
            </p>
            <p className="text-muted-foreground text-xs">
              {WORDS.sayItFirstHint}
            </p>
          </section>
        </>
      )}

      {state.blocked !== null && activity.kind === "idle" && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm"
        >
          {RECORDING_FAILURE_COPY[state.blocked]}
        </p>
      )}

      <div aria-live="polite" className="flex min-h-9 items-center gap-3">
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">
          {state.notice}
        </p>
        {state.undo !== null && !asking && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch({ type: "undo" })}
          >
            {WORDS.undo}
          </Button>
        )}
      </div>

      {outboxWords !== "" && (
        <p className="text-muted-foreground text-xs">{outboxWords}</p>
      )}

      <Sheet
        open={panel !== "none"}
        onOpenChange={(open) => {
          if (!open) setPanel("none")
        }}
      >
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          data-scroll-intent
          className={
            // scroll-intent: a full-screen list of every scenario, read by scrolling
            "h-dvh overflow-y-auto px-4 pt-4 pb-8"
          }
        >
          <div className="mx-auto max-w-md space-y-4">
            <SheetHeader className="text-left">
              <SheetTitle className="text-xl font-bold uppercase tracking-wide">
                {panel === "modes" ? WORDS.settingsTitle : WORDS.legendTitle}
              </SheetTitle>
            </SheetHeader>
            {panel === "modes" ? (
              <Modes
                state={state}
                onPick={(mode) => dispatch({ type: "pickMode", mode })}
              />
            ) : (
              <Legend onPick={pickFromLegend} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
