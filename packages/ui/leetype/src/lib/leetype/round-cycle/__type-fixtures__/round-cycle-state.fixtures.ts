/**
 * TSC-STATIC1 (#1365): Thm. 8.1's "the transition function is total", held
 * by the compiler rather than restated at runtime.
 *
 * `RoundCycleState` has four phases, one per named successor in Thm. 8.1's
 * proof. The switch below names each of them and ends in `assertNever`, so:
 *
 *   - a fifth phase added to the union without a case here fails
 *     `tsc --noEmit` at `assertNever(state)` ("not assignable to parameter
 *     of type 'never'");
 *   - a phase removed from the union fails at its now-impossible `case`
 *     label.
 *
 * `round-cycle/index.test.ts` used to carry this same switch inside an
 * `it()` that ran it over four constructed states and asserted it did not
 * throw — a runtime restatement of a guarantee that only exists at compile
 * time. The runtime half of Thm. 8.1 (every branch is reachable and has a
 * defined, distinct successor) stays in that file.
 *
 * Not a `*.test.ts`: Vitest never discovers it, and `tsc --noEmit` picks it
 * up through tsconfig.json's `src` include. See
 * `packages/intent-kit/src/__type-fixtures__/` for the same convention.
 */
import type { RoundCycleState } from "@leetype/lib/leetype/round-cycle"
import { assertNever } from "some-ui-utils"

declare const state: RoundCycleState

function phaseOf(state: RoundCycleState): RoundCycleState["phase"] {
  switch (state.phase) {
    case "posingDiffSelection":
    case "admissibleAdvance":
    case "posingRescueSelection":
    case "posingUnrescuableExplanation": {
      return state.phase
    }
    default: {
      return assertNever(state)
    }
  }
}
void phaseOf(state)
