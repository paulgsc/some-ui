/**
 * Away from home as one state the phone knows (#2928): home's name answers
 * only on the home network, so off it every request waits out the connect
 * timeout and finds nothing. Pure; `./runtime` keeps the timer and feeds the
 * events, `./model` holds the state.
 *
 * **AW1: away from home is said once and waited out, not a failure per call.**
 *
 * - _Claim:_ once a request to home other than a pairing's or an Unpair's
 *   finds no answer, the link tells it once (`report`, as the stretch
 *   starts) and, until home answers, sends nothing the phone starts on its
 *   own (a lane's drain, a screen's read on its own, home's word on itself,
 *   Game day's socket) but one try each hold, `holdMs` doubling from 30 s to
 *   10 minutes; a network change, a pull or Send now lets the next try go at
 *   once, what the person asks for (a sync, a send, a screen's read) still
 *   goes, and nothing waiting on the phone is dropped. The lanes say "Away
 *   from home since …" (`./words`).
 * - _Family:_ every ordering of a silence, an answer, the hold's end, a
 *   network change or a pull, and time passing (six long); requests in
 *   flight as a stretch starts, settling in either order; an answer to a
 *   request sent before the stretch began; every moment a lane is asked
 *   (an edit, the app in front, the network, a pull, the hold's end); the
 *   live socket made, found silent or opened against a hold beginning or
 *   ending; a screen's read asked for or on its own; a pairing or Unpair
 *   finding no answer.
 * - _Proof:_ `__tests__/away.test.ts` ("AW1"), over `stepAway` and over the
 *   real link, lanes and watches; `__tests__/live-machine.test.ts` and
 *   `__tests__/live.test.ts` for the socket; `__tests__/pull.test.ts` and
 *   `components/__tests__/device-home-glyph.test.tsx` for a pull;
 *   `__tests__/words.test.ts` for the line.
 * - _Tolerance:_ the phone cannot tell off the home network from home being
 *   down on it, so either is one stretch, told once; a network change the
 *   WebView does not announce (`online`) waits for the hold.
 */
import { assertNever } from "@some-ui/core-utils"

/** A stretch away from home. */
export type Away = {
  /** When the first request of the stretch found no answer. */
  readonly since: number
  /** Tries that found no answer this stretch, for the next hold's length. */
  readonly tries: number
  /** Until when nothing the phone starts on its own is sent; null once over. */
  readonly heldUntil: number | null
  /**
   * The hold was let go by a network change or the person, whose own ask
   * follows: the lanes' watches leave that ask to them (`./kept-watch`).
   */
  readonly askedAgain: boolean
}

export type AwayEvent =
  /** A request found no answer from home, at `now`. */
  | { readonly type: "unanswered"; readonly now: number }
  /** Home answered something. */
  | { readonly type: "answered" }
  /** The hold's time has passed. */
  | { readonly type: "lapsed" }
  /** The network changed, or the person pulled to check again. */
  | { readonly type: "lookAgain" }

/** The first hold of a stretch: longer than one try's own wait. */
export const FIRST_HOLD_MS = 30_000
/** The longest hold: while away, at most one try each this long. */
export const LONGEST_HOLD_MS = 600_000

/** The hold after the `tries`th try that found no answer: 30 s doubling to 10 minutes. */
export function holdMs(tries: number): number {
  return Math.min(LONGEST_HOLD_MS, FIRST_HOLD_MS * 2 ** Math.min(tries, 5))
}

/** Whether `away`'s hold lasts at `now`: a hold whose time has passed is over. */
export function held(away: Away | null, now: number): boolean {
  return away?.heldUntil != null && now < away.heldUntil
}

export function stepAway(away: Away | null, event: AwayEvent): Away | null {
  switch (event.type) {
    case "unanswered": {
      // Sent before this hold began: it says nothing new.
      if (held(away, event.now)) return away
      const tries = away?.tries ?? 0
      return {
        since: away?.since ?? event.now,
        tries: tries + 1,
        heldUntil: event.now + holdMs(tries),
        askedAgain: false,
      }
    }
    case "answered": {
      return null
    }
    case "lapsed": {
      return away?.heldUntil == null
        ? away
        : { ...away, heldUntil: null, askedAgain: false }
    }
    case "lookAgain": {
      return away === null ||
        (away.heldUntil === null && away.tries === 0 && away.askedAgain)
        ? away
        : { ...away, tries: 0, heldUntil: null, askedAgain: true }
    }
    default: {
      return assertNever(event)
    }
  }
}
