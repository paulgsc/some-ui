import { describe, expect, it } from "vitest"

import type { Action } from "../contracts/action"
import { apply, type ActionRealizer } from "./apply"
import { isSelfTagged } from "./self-tag"

/**
 * Theorem 7.2 (Loop suppression) — canon §7, executable.
 *
 * Given actuation that is idempotent (Definition 7.3) and self-tagged, a
 * key whose environment-driven mutation rate is zero over an interval
 * cannot sustain an infinite sequence of non-empty Δ(k): after the first
 * repair, every further planner round yields Δ(k) = ∅.
 *
 * This is a closed-loop simulation local to this test file — a minimal
 * φ/decide pair standing in for a real Adapter (S7 ships only the null
 * adapter) — that exercises the real `apply()`/`tag()`/`isSelfTagged()`
 * machinery from this package, not a re-statement of the proof in prose.
 */

type MaskAction = Action & { readonly kind: "mask"; readonly key: string }

describe("actuator — Theorem 7.2 (loop suppression), executable", () => {
  it("repeated planner rounds against a stable environment never produce a second non-empty Δ(k) after the first repair", () => {
    const root = document.createElement("div")
    root.innerHTML = `<div data-key="k1"></div>`
    document.body.appendChild(root)

    const realize: ActionRealizer<MaskAction> = (action) => {
      const el = root.querySelector<HTMLElement>(`[data-key="${action.key}"]`)
      if (el === null) {
        return []
      }
      el.setAttribute("data-masked", "true")
      return [el]
    }

    // φ(k, ·): "k" is satisfied once its element is both masked and
    // self-tagged — self-tagging lets this check distinguish "already
    // repaired by us" from "genuinely still unsafe," which is exactly what
    // lets an actuator echo be recognized rather than misread as new
    // environment-driven evidence.
    function isSatisfied(key: string): boolean {
      const el = root.querySelector(`[data-key="${key}"]`)
      return (
        el !== null &&
        el.getAttribute("data-masked") === "true" &&
        isSelfTagged(el)
      )
    }

    // decide(): Definition 6.2's Δ — touches only keys currently failing φ.
    function decide(keys: ReadonlyArray<string>): ReadonlyArray<MaskAction> {
      return keys
        .filter((key) => !isSatisfied(key))
        .map((key) => ({ kind: "mask", key }))
    }

    const keys = ["k1"]
    const deltaSizes: Array<number> = []

    // Ten planner rounds over a zero-environment-mutation-rate interval —
    // no new vendor evidence is ever introduced between rounds.
    for (let round = 0; round < 10; round++) {
      const delta = decide(keys)
      deltaSizes.push(delta.length)
      apply<MaskAction>(delta, { realize, tagValue: (a) => a.key })
    }

    expect(deltaSizes[0]).toBe(1) // the first repair
    expect(deltaSizes.slice(1)).toEqual(deltaSizes.slice(1).map(() => 0)) // every round after: Δ = ∅

    root.remove()
  })
})
