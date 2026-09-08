import { describe, expect, it } from "vitest"

import type { PropositionRegisterEntry } from "./parse-canon"
import {
  assertNoRegisteredIdWasRemoved,
  idsInGeneratedFile,
} from "./registry-integrity"

const ENTRY_1: PropositionRegisterEntry = {
  id: "CW-P1",
  title: "Sequential composition adds",
  statement:
    "Sibling control flow executed in sequence contributes the sum of its members' costs.",
  status: "active",
}

const ENTRY_2: PropositionRegisterEntry = {
  id: "CW-P2",
  title: "Nested repetition multiplies",
  statement:
    "A body enclosed in a repetition contributes the product of the repetition count and the body's cost.",
  status: "active",
}

describe("idsInGeneratedFile", () => {
  it("extracts every CW-P id from a generated.ts-shaped string", () => {
    const source = `
export type PropositionId =
  | "CW-P1"
  | "CW-P2"

export const PROPOSITION_REGISTER = {
  "CW-P1": { id: "CW-P1", title: "Sequential composition adds", status: "active" },
  "CW-P2": { id: "CW-P2", title: "Nested repetition multiplies", status: "active" },
}
`
    expect(idsInGeneratedFile(source)).toEqual(new Set(["CW-P1", "CW-P2"]))
  })

  it("returns an empty set for an empty or non-existent file", () => {
    expect(idsInGeneratedFile("")).toEqual(new Set())
  })
})

// Review finding on #1241 (chatgpt-codex-connector): removing a canon
// entry outright shrinks the register to a still-contiguous CW-P1..CW-Pmax
// sequence, which parsePropositionRegister's own gap check cannot tell
// apart from a register that never had the missing id. Only comparing
// against what was previously committed catches a real removal.
describe("assertNoRegisteredIdWasRemoved", () => {
  it("does not throw when nothing was removed", () => {
    expect(() =>
      assertNoRegisteredIdWasRemoved(new Set(["CW-P1"]), [ENTRY_1, ENTRY_2])
    ).not.toThrow()
  })

  it("does not throw against an empty previous set (first-ever generation)", () => {
    expect(() =>
      assertNoRegisteredIdWasRemoved(new Set(), [ENTRY_1])
    ).not.toThrow()
  })

  it("throws when a previously-registered id is missing from the new entries", () => {
    expect(() =>
      assertNoRegisteredIdWasRemoved(new Set(["CW-P1", "CW-P2"]), [ENTRY_1])
    ).toThrow(/would remove CW-P2/)
  })
})
