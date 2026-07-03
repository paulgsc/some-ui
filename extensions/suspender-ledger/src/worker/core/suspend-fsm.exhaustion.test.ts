// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Transition graph exhaustion test (issue #345).
 *
 * Enumerates the entire (state × event) matrix and asserts the invariant holds
 * on the resulting state for every pair. This is deterministic: it finds gaps
 * in the transition graph that a hand-picked unit test would miss. Property
 * tests (issue #344) complement this by exploring *sequences*.
 *
 * `allStates` / `allEvents` are exported from `suspend-fsm.ts` so the property
 * suite reuses them as arbitraries (an acceptance criterion of #345).
 */

import { describe, expect, it } from "vitest"

import {
  allEvents,
  allStates,
  invariant,
  reduce,
  type SuspendState,
} from "./suspend-fsm"

const describeState = (st: SuspendState): string => st.kind

describe("suspend FSM — transition graph exhaustion", () => {
  it("preserves the invariant across every (state, event) pair", () => {
    const violations: Array<string> = []

    for (const state of allStates) {
      for (const event of allEvents) {
        const next = reduce(state, event)
        if (!invariant(next)) {
          violations.push(
            `${describeState(state)} --${event.type}--> ${describeState(next)}`
          )
        }
      }
    }

    // A non-empty list here is the transition graph telling us exactly which
    // edges strand the marker on a live tab.
    expect(violations).toEqual([])
  })

  it("is total — reduce returns a defined state for every pair", () => {
    for (const state of allStates) {
      for (const event of allEvents) {
        expect(reduce(state, event)).toBeDefined()
      }
    }
  })

  it("never produces the illegal ORPHANED state from any legal state", () => {
    const orphaning: Array<string> = []
    for (const state of allStates) {
      for (const event of allEvents) {
        if (reduce(state, event).kind === "ORPHANED") {
          orphaning.push(`${state.kind} --${event.type}-->`)
        }
      }
    }
    expect(orphaning).toEqual([])
  })
})
