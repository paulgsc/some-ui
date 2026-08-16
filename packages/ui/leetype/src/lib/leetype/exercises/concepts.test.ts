import { describe, expect, it } from "vitest"

import { CONCEPT_IDS } from "./concepts"
import { ALL_FIXTURE_EXERCISES } from "./index"

/** Every id, as a plain `Set<string>` — the corpus check below compares
 * against `step.concepts: Array<string>`, which a `Set<ConceptId>` cannot
 * `.has()` without narrowing first. */
const KNOWN_IDS: Set<string> = new Set(Object.values(CONCEPT_IDS))

describe("concept identity (LTY-SEAM S5, #1019)", () => {
  it("every id is stable kebab-case, never a display string", () => {
    for (const id of Object.values(CONCEPT_IDS)) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it("no two keys collapse onto the same id", () => {
    // A duplicate value here would silently reunify two distinct
    // abstractions the moment someone typos a key and TypeScript can't
    // catch it — this is the one thing property access alone can't enforce.
    const ids = Object.values(CONCEPT_IDS)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("every step in the shipped corpus draws its concepts from this list", () => {
    // Belt-and-braces alongside the typecheck-level guarantee: property
    // access on `CONCEPT_IDS` can't produce a value outside this set, but
    // this pins that the migration actually reached every step rather than
    // leaving a stray inline string behind uncaught.
    for (const exercise of ALL_FIXTURE_EXERCISES) {
      for (const step of exercise.steps) {
        for (const concept of step.concepts) {
          expect(KNOWN_IDS.has(concept)).toBe(true)
        }
      }
    }
  })
})
