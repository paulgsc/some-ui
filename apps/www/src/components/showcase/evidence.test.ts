import { describe, expect, it } from "vitest"

import { readEvidence } from "./build-data"
import { excerpt, sourceUrl, verdicts } from "./evidence"
import { OWNER_VOICE } from "./words"

const EVIDENCE = readEvidence()

describe("showcase evidence", () => {
  it("accounts for every ledger verdict without calling gaps healthy", () => {
    const counts = EVIDENCE.counts
    expect(counts.total).toBeGreaterThan(0)
    expect(counts.holds + counts.other).toBe(counts.total)
    expect(counts.holds).toBeGreaterThan(0)
    expect(counts.other).toBeGreaterThan(0)
    expect(verdicts([])).toEqual({ total: 0, holds: 0, other: 0 })
  })
  it("preserves literal source excerpts and fails if an anchor moves", () => {
    expect(EVIDENCE.canon).toContain("$ S_t =")
    expect(EVIDENCE.gestures).toContain(
      "packages/ui/shared/src/lib/pager/runtime/index.ts"
    )
    expect(excerpt("before START middle END after", "START", "END")).toBe(
      "START middle END"
    )
    expect(() => excerpt("changed", "START", "END")).toThrow(
      "Missing showcase excerpt"
    )
    expect(() => excerpt("START changed", "START", "END")).toThrow(
      "Missing showcase excerpt"
    )
  })
  it("identifies the call as sample words and leaves the owner's recording absent", () => {
    expect(EVIDENCE.sampleSaid).toContain("these are sample words")
    expect(OWNER_VOICE).toBeNull()
    expect(sourceUrl("CLAUDE.md")).toMatch(/blob\/78519a76\/CLAUDE.md$/)
  })
})
