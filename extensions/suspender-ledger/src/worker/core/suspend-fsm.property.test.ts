// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Property-based tests for the suspend FSM (issue #344).
 *
 * Exhaustion (#345) checks single steps. These fold *sequences* of 1–50 random
 * events through the reducer from every legal initial state and assert the
 * invariant holds at every intermediate and final state. This is the layer that
 * catches "weird timeline" bugs: a discard refused mid-suspend, a refocus
 * racing the discard callback, media starting after the suspend request.
 *
 * fast-check shrinking (on by default) reports the minimal reproducing sequence
 * when a property fails.
 */

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  allEvents,
  allStates,
  invariant,
  isLive,
  isMarked,
  isSettled,
  reduce,
  type SuspendEvent,
  type SuspendState,
} from "./suspend-fsm"

const eventArbitrary: fc.Arbitrary<SuspendEvent> = fc.constantFrom(...allEvents)
const stateArbitrary: fc.Arbitrary<SuspendState> = fc.constantFrom(...allStates)
const sequenceArbitrary = fc.array(eventArbitrary, {
  minLength: 1,
  maxLength: 50,
})

const fold = (
  initial: SuspendState,
  events: ReadonlyArray<SuspendEvent>
): Array<SuspendState> => {
  const trace: Array<SuspendState> = [initial]
  let state = initial
  for (const event of events) {
    state = reduce(state, event)
    trace.push(state)
  }
  return trace
}

describe("suspend FSM — properties", () => {
  it("holds the invariant at every step of any event sequence", () => {
    fc.assert(
      fc.property(stateArbitrary, sequenceArbitrary, (initial, events) => {
        for (const state of fold(initial, events)) {
          expect(invariant(state)).toBe(true)
        }
      })
    )
  })

  it("never rests with a marker stranded on a live tab", () => {
    // The settled form of the invariant: after any sequence, if the machine is
    // at rest and the tab is still live, it must not be wearing the marker.
    fc.assert(
      fc.property(stateArbitrary, sequenceArbitrary, (initial, events) => {
        const trace = fold(initial, events)
        const final = trace[trace.length - 1]
        if (final !== undefined && isSettled(final) && isLive(final)) {
          expect(isMarked(final)).toBe(false)
        }
      })
    )
  })

  // Negative property (#344 acceptance criterion): a prohibited transition is
  // rejected. An audible tab must never end up suspended-and-marked — the
  // MEDIA_PLAYING signal has to divert it away from the mark→discard path.
  it("never marks a tab whose only suspend attempt was preceded by MEDIA_PLAYING", () => {
    fc.assert(
      fc.property(
        // sequences that begin from an idle tab, see media, then are asked to
        // suspend — the exact YouTube scenario.
        fc.array(eventArbitrary, { minLength: 0, maxLength: 20 }),
        (rest) => {
          const events: Array<SuspendEvent> = [
            { type: "MEDIA_PLAYING" },
            { type: "SUSPEND_REQUESTED" },
            ...rest,
          ]
          // Without any DISCARD_SUCCEEDED the tab is still live; it must not be
          // wearing the marker at rest.
          const trace = fold({ kind: "ACTIVE" }, events)
          const final = trace[trace.length - 1]
          if (final !== undefined && isSettled(final) && isLive(final)) {
            expect(isMarked(final)).toBe(false)
          }
        }
      )
    )
  })

  it("only reaches DISCARDED through an explicit successful discard", () => {
    // Resurrection guard: DISCARDED is only entered via DISCARD_SUCCEEDED.
    fc.assert(
      fc.property(stateArbitrary, sequenceArbitrary, (initial, events) => {
        let state = initial
        for (const event of events) {
          const next = reduce(state, event)
          if (next.kind === "DISCARDED" && state.kind !== "DISCARDED") {
            expect(event.type).toBe("DISCARD_SUCCEEDED")
          }
          state = next
        }
      })
    )
  })
})
