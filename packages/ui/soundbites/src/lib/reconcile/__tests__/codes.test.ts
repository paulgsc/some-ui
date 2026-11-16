/** @vitest-environment node */
import type { ProblemCode, TakeVerdict } from "@soundbites/lib/reconcile/codes"
import {
  codeCounts,
  CODES,
  codesOf,
  FAILED_CODES,
  GARBLED_CODES,
  groupByCode,
} from "@soundbites/lib/reconcile/codes"
import { describe, expect, it } from "vitest"

const verdict = (
  kind: TakeVerdict["kind"],
  reasons: ReadonlyArray<string> = []
): TakeVerdict => ({ kind, reasons, rule: "heard-1", language: null })

describe("the codes a take home couldn't hear is listed under (HEARD3)", () => {
  it("lists none for a take heard, or not judged yet", () => {
    expect(codesOf(null)).toEqual([])
    expect(codesOf(undefined)).toEqual([])
    expect(codesOf(verdict("heard"))).toEqual([])
  })

  it("gives nothing said its own code", () => {
    expect(codesOf(verdict("nothing_said"))).toEqual(["nothing_said"])
  })

  it("keeps every code of a garbled or failed take apart, in the page's order", () => {
    for (const code of GARBLED_CODES) {
      expect(codesOf(verdict("garbled", [code]))).toEqual([code])
    }
    for (const code of FAILED_CODES) {
      expect(codesOf(verdict("failed", [code]))).toEqual([code])
    }
    expect(codesOf(verdict("garbled", ["sparse", "low_confidence"]))).toEqual([
      "low_confidence",
      "sparse",
    ])
  })

  it("never drops a take for a code this phone doesn't know", () => {
    expect(codesOf(verdict("garbled", ["mumbled"]))).toEqual(["garbled"])
    expect(codesOf(verdict("garbled", ["sparse", "mumbled"]))).toEqual([
      "sparse",
      "garbled",
    ])
    expect(codesOf(verdict("garbled"))).toEqual(["garbled"])
    expect(codesOf(verdict("failed", ["unplugged"]))).toEqual(["failed"])
    // A failure's code is never read as a garble's, nor the other way.
    expect(codesOf(verdict("failed", ["sparse"]))).toEqual(["failed"])
    expect(codesOf(verdict("garbled", ["deadline"]))).toEqual(["garbled"])
  })

  it("groups each take under its first code, one group per code, and counts each under all of its codes", () => {
    type Take = { id: string; codes: ReadonlyArray<ProblemCode> }
    const takes: ReadonlyArray<Take> = [
      { id: "a", codes: ["low_confidence", "sparse"] },
      { id: "b", codes: ["deadline"] },
      { id: "c", codes: ["sparse"] },
      { id: "d", codes: [] },
      { id: "e", codes: ["low_confidence"] },
    ]
    const codes = (take: Take): ReadonlyArray<ProblemCode> => take.codes
    expect(
      groupByCode(takes, codes).map(({ code, takes: each }) => [
        code,
        each.map(({ id }) => id),
      ])
    ).toEqual([
      ["low_confidence", ["a", "e"]],
      ["sparse", ["c"]],
      ["deadline", ["b"]],
    ])
    expect(codeCounts(takes, codes)).toEqual([
      { code: "low_confidence", count: 2 },
      { code: "sparse", count: 2 },
      { code: "deadline", count: 1 },
    ])
  })

  it("orders the codes garbled, nothing said, then failed", () => {
    expect(CODES.indexOf("nothing_said")).toBeGreaterThan(
      CODES.indexOf("garbled")
    )
    expect(CODES.indexOf("unreadable")).toBeGreaterThan(
      CODES.indexOf("nothing_said")
    )
  })
})
