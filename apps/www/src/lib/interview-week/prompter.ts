/**
 * The teleprompter band for reading aloud (IW9, paulgsc/some-ui#3176), as a
 * pure state and `step`. The runtime (`./runtime`) feeds it the recorder's
 * own level as each take under way is measured, so there is no second
 * capture and no transcription; the reading page draws `bandOf`.
 *
 * Built to the prototype the owner agreed on 2026-11-17 (page 4,
 * https://claude.ai/artifact/3qFe2qLVB2qabmdVcjBArp): one phrase a line in
 * large type, a band at about a third of the height, the line read lit and
 * the next dimmed; it moves while you speak, holds while you pause, and a
 * Pause / Go on button stops and restarts it (C615). The pace and the hold
 * are C616; the band has no drag to nudge (C617).
 *
 * - **Moves only while you speak.** A level at or over `HEARD_FLOOR` (the
 *   line a take must reach to count as heard) marks the voice heard; the
 *   band moves at `PACE_WPM` until `HOLD_MS` passes with nothing heard, so
 *   it never runs on past you.
 * - **Each take starts from the top.** A take answering another line, or
 *   one starting after the last ended, reads from the first word.
 * - **Only time spoken through moves it.** The stretch since the last read
 *   counts only when the voice was heard within `HOLD_MS` before its end, so
 *   the quiet before a first word, or a phone that slept mid-take, never does.
 * - **It stops at the end**, and stays on the last line, holding.
 * - **A hand can always move the script.** The band scrolls an ordinary
 *   scroller, so a take whose level isn't measured (no Web Audio, or one
 *   that never started) still reads, by hand, as the script did before.
 */
import { assertNever } from "@some-ui/core-utils"
import { HEARD_FLOOR } from "@some-ui/voice-capture"

/** Words a minute the band moves at while you speak (C616). */
export const PACE_WPM = 140

/** How long the band moves on after the voice was last heard (C616). */
export const HOLD_MS = 1000

/** Whether the voice was heard within `HOLD_MS` of `at`. */
const heardLately = (heardAt: number | null, at: number): boolean =>
  heardAt !== null && at - heardAt <= HOLD_MS

export type Prompter =
  /** No take under way. */
  | { readonly kind: "idle" }
  | {
      readonly kind: "reading"
      /** The take's line, as the recorder says what it answers. */
      readonly answers: string
      /** Words read so far, a fraction while the band is between them. */
      readonly words: number
      /** When the last read was, by the runtime's clock. */
      readonly at: number
      /** When the voice was last heard; null while not yet. */
      readonly heardAt: number | null
      /** Paused by the button: the take records, the band holds. */
      readonly paused: boolean
    }

export const NO_PROMPTER: Prompter = { kind: "idle" }

export type PrompterEvent =
  /** The recorder measured the take under way. */
  | {
      readonly type: "heard"
      readonly answers: string
      readonly level: number
      readonly at: number
      /** The script's words: the band stops at the last. */
      readonly total: number
    }
  /** No take is under way. */
  | { readonly type: "ended" }
  /** The Pause / Go on button. */
  | { readonly type: "pause" }

export function stepPrompter(state: Prompter, event: PrompterEvent): Prompter {
  switch (event.type) {
    case "ended": {
      return state.kind === "idle" ? state : NO_PROMPTER
    }
    case "pause": {
      return state.kind === "idle" ? state : { ...state, paused: !state.paused }
    }
    case "heard": {
      const { answers, level, at, total } = event
      const heard = level >= HEARD_FLOOR
      if (state.kind === "idle" || state.answers !== answers) {
        return {
          kind: "reading",
          answers,
          words: 0,
          at,
          heardAt: heard ? at : null,
          paused: false,
        }
      }
      // Heard before this read, not at it: the stretch just ended was spoken.
      const moving = !state.paused && heardLately(state.heardAt, at)
      const elapsed = Math.max(at - state.at, 0)
      const words = moving
        ? Math.min(state.words + (elapsed * PACE_WPM) / 60_000, total)
        : state.words
      return { ...state, words, at, heardAt: heard ? at : state.heardAt }
    }
    default: {
      return assertNever(event)
    }
  }
}

/** What the band says about itself, as its words name it. */
type BandState = "waiting" | "moving" | "holding" | "paused"

export type Band = {
  /** The line read now: lit, at the band. */
  readonly line: number
  readonly state: BandState
}

/** The number of words in `line`, as the band counts them. */
const wordsIn = (line: string): number =>
  line.split(/\s+/u).filter((word) => word !== "").length

/** Every word of `lines`. */
export const totalOf = (lines: ReadonlyArray<string>): number =>
  lines.reduce((sum, line) => sum + wordsIn(line), 0)

/**
 * The band over `lines` for the take answering `answers`: the first line
 * and holding while that take isn't the one being read.
 */
export function bandOf(
  state: Prompter,
  answers: string,
  lines: ReadonlyArray<string>
): Band {
  if (state.kind === "idle" || state.answers !== answers) {
    return { line: 0, state: "holding" }
  }
  let line = 0
  let before = 0
  for (const [index, text] of lines.entries()) {
    const words = wordsIn(text)
    // The line whose words the band is among; a line read through hands on
    // to the next, and the last stays.
    line = index
    if (state.words < before + words) break
    before += words
  }
  // At the last word there is nowhere to move: the band holds.
  const moving =
    state.words < totalOf(lines) && heardLately(state.heardAt, state.at)
  return {
    line,
    state: state.paused
      ? "paused"
      : state.heardAt === null
        ? // Nothing heard yet this take: a level that isn't measured stays here.
          "waiting"
        : moving
          ? "moving"
          : "holding",
  }
}
