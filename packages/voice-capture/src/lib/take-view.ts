/**
 * What the take pattern's parts show for one item: the take
 * button, the line said beside it, and the item's takes as rows, current
 * first and earlier ones apart (D2). A pure projection of the pattern's
 * snapshot, the screen's takes and the options, as Zag's `connect` maps a
 * machine's state onto markup: the parts in `@some-ui/shared` render it and
 * dispatch the pattern's intents, and decide nothing.
 */
import { assertNever } from "@some-ui/core-utils"

import type { TakeEnded } from "./take-kit"
import type {
  PatternTake,
  TakePatternOptions,
  TakePatternSnapshot,
  TakePlace,
} from "./take-pattern"

/** The last stretch of a take, when the button warns that time is nearly up. */
export const NEARLY_UP_MS = 10_000

/** The take button, as it is for one item. */
export type TakeButtonView =
  /** A tap starts a take; `again` when it would supersede the item's take (D2). */
  | { readonly kind: "ready"; readonly again: boolean }
  /** Still tappable: a tap now lets the take go before it starts. */
  | { readonly kind: "opening" }
  | {
      readonly kind: "recording"
      readonly elapsedMs: number
      readonly capMs: number
      /** How loud the input is, 0 (silence) to 1. */
      readonly level: number
      /** In the last `NEARLY_UP_MS` before the cap. */
      readonly nearlyUp: boolean
    }
  /** Stopped, being kept: nothing to tap. */
  | { readonly kind: "keeping" }
  /** Another item's take is under way on this screen. */
  | { readonly kind: "elsewhere" }
  /** As many takes as the item keeps (`takes.max`): Redo or Let go makes room. */
  | { readonly kind: "full"; readonly max: number }

/** One take's row: what it offers now. */
export type TakeRowView = {
  readonly take: PatternTake
  /** Its audio is being read or playing. */
  readonly playing: boolean
  readonly canPlay: boolean
  readonly canRedo: boolean
  readonly canLetGo: boolean
}

/** The one line said beside the button, once, for this item. */
export type TakeSaid =
  | { readonly kind: "ended"; readonly ended: TakeEnded }
  | { readonly kind: "setAside"; readonly place: TakePlace }
  | { readonly kind: "unplayable" }

export type TakeItemView = {
  readonly button: TakeButtonView
  /** The take a tap on the button would supersede if kept (D2). */
  readonly supersedes: string | null
  readonly said: TakeSaid | null
  /** The item's takes, newest first: one at most for `per: "one"`. */
  readonly current: ReadonlyArray<TakeRowView>
  /** Superseded takes, newest first, kept out of the item's view (D2). */
  readonly earlier: ReadonlyArray<TakeRowView>
}

function newestFirst(a: PatternTake, b: PatternTake): number {
  if (a.recordedAt === b.recordedAt) return 0
  return a.recordedAt < b.recordedAt ? 1 : -1
}

/**
 * `answers`' takes as the pattern shows them: a take set aside is out of the
 * item (D3), and under `per: "one"` only the newest current take is the
 * item's; any other is shown as earlier.
 */
function split(
  takes: ReadonlyArray<PatternTake>,
  answers: string,
  options: TakePatternOptions
): { current: Array<PatternTake>; earlier: Array<PatternTake> } {
  const mine = takes
    .filter((take) => take.answers === answers && take.standing !== "set-aside")
    .sort(newestFirst)
  const current = mine.filter((take) => take.standing === "current")
  const earlier = mine.filter((take) => take.standing === "earlier")
  if (options.takes.per === "one" && current.length > 1) {
    return {
      current: current.slice(0, 1),
      earlier: [...current.slice(1), ...earlier].sort(newestFirst),
    }
  }
  return { current, earlier }
}

function buttonOf(
  snapshot: TakePatternSnapshot,
  answers: string,
  current: ReadonlyArray<PatternTake>,
  options: TakePatternOptions
): TakeButtonView {
  const { take } = snapshot
  if (take.kind !== "idle" && snapshot.answers !== answers) {
    return { kind: "elsewhere" }
  }
  switch (take.kind) {
    case "idle": {
      const { takes } = options
      if (takes.per === "many" && current.length >= takes.max) {
        return { kind: "full", max: takes.max }
      }
      return { kind: "ready", again: takes.per === "one" && current.length > 0 }
    }
    case "opening":
    case "keeping": {
      return { kind: take.kind }
    }
    case "recording": {
      return {
        kind: "recording",
        elapsedMs: take.elapsedMs,
        capMs: take.capMs,
        level: take.level,
        nearlyUp: take.capMs - take.elapsedMs <= NEARLY_UP_MS,
      }
    }
    default: {
      return assertNever(take)
    }
  }
}

function saidOf(
  snapshot: TakePatternSnapshot,
  answers: string,
  mine: (id: string) => boolean
): TakeSaid | null {
  // While this item's take is under way, the button says how it goes.
  if (snapshot.take.kind !== "idle" && snapshot.answers === answers) return null
  if (snapshot.unplayable !== null && mine(snapshot.unplayable)) {
    return { kind: "unplayable" }
  }
  if (snapshot.setAside !== null && mine(snapshot.setAside.id)) {
    return { kind: "setAside", place: snapshot.setAside.place }
  }
  const { ended } = snapshot
  if (ended !== null && ended.answers === answers)
    return { kind: "ended", ended }
  return null
}

/** What the parts show for `answers`, from the screen's `takes`. */
export function takeItemView(
  snapshot: TakePatternSnapshot,
  takes: ReadonlyArray<PatternTake>,
  answers: string,
  options: TakePatternOptions
): TakeItemView {
  const { current, earlier } = split(takes, answers, options)
  // The row's actions wait while any take on this screen is under way.
  const quiet = snapshot.take.kind === "idle"
  const { playback } = snapshot
  const playing = (take: PatternTake): boolean =>
    playback.kind !== "quiet" && playback.id === take.id
  const ids = new Set(
    takes.filter((take) => take.answers === answers).map((take) => take.id)
  )
  return {
    button: buttonOf(snapshot, answers, current, options),
    supersedes: options.takes.per === "one" ? (current[0]?.id ?? null) : null,
    said: saidOf(snapshot, answers, (id) => ids.has(id)),
    current: current.map((take, at) => ({
      take,
      playing: playing(take),
      canPlay: quiet && (options.play === "each" || at === 0),
      canRedo: quiet,
      canLetGo: quiet,
    })),
    earlier: earlier.map((take) => ({
      take,
      playing: playing(take),
      canPlay: quiet && options.play === "each",
      canRedo: false,
      canLetGo: false,
    })),
  }
}
