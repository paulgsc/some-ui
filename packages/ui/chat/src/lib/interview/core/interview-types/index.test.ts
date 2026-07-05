import { describe, expect, it } from "vitest"

import { PersistedSnapshotSchema } from "."

// ═══════════════════════════════════════════════════════════════════════════
// PersistedSnapshotSchema - session-storage.ts silently swallows parse
// failures, so this is the cheap insurance that a malformed snapshot is
// actually rejected rather than accepted and used downstream.
// ═══════════════════════════════════════════════════════════════════════════

describe("PersistedSnapshotSchema", () => {
  it("parses a well-formed snapshot", () => {
    const snapshot = {
      currentIndex: 2,
      notes: "notes",
      answers: [
        { questionId: "q1", transcript: "t", notes: "n", durationSeconds: 10 },
      ],
      updatedAt: 1_700_000_000_000,
    }
    expect(PersistedSnapshotSchema.parse(snapshot)).toEqual(snapshot)
  })

  it("rejects a malformed snapshot instead of silently coercing it", () => {
    const malformed = {
      currentIndex: "two",
      notes: "notes",
      answers: "not-an-array",
      updatedAt: 1_700_000_000_000,
    }
    expect(() => PersistedSnapshotSchema.parse(malformed)).toThrow()
  })

  it("rejects an answer entry missing a required field", () => {
    const malformed = {
      currentIndex: 0,
      notes: "",
      answers: [{ questionId: "q1", transcript: "t", notes: "n" }],
      updatedAt: 0,
    }
    expect(() => PersistedSnapshotSchema.parse(malformed)).toThrow()
  })
})
