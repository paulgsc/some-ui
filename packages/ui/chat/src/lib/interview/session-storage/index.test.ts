import type { PersistedSnapshot } from "@chat/lib/interview/core/interview-types"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  clearPersistedSession,
  readPersistedSession,
  writePersistedSession,
} from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "some-ui:mock-interview:session"

function makeSnapshot(
  overrides: Partial<PersistedSnapshot> = {}
): PersistedSnapshot {
  return {
    currentIndex: 1,
    notes: "some notes",
    answers: [
      {
        questionId: "q1",
        transcript: "an answer",
        notes: "",
        durationSeconds: 42,
      },
    ],
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
// readPersistedSession - corrupt data / storage-unavailable paths
// ═══════════════════════════════════════════════════════════════════════════

describe("readPersistedSession", () => {
  it("returns null when nothing has been persisted", () => {
    expect(readPersistedSession()).toBeNull()
  })

  it("round-trips a snapshot written via writePersistedSession", () => {
    const snapshot = makeSnapshot()
    writePersistedSession(snapshot)
    expect(readPersistedSession()).toEqual(snapshot)
  })

  it("returns null for malformed JSON instead of throwing", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json")
    expect(readPersistedSession()).toBeNull()
  })

  it("returns null when the stored JSON fails schema validation", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ currentIndex: "not-a-number" })
    )
    expect(readPersistedSession()).toBeNull()
  })

  it("returns null when localStorage.getItem throws (storage unavailable)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: storage disabled")
    })
    expect(readPersistedSession()).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// writePersistedSession - swallows storage failures
// ═══════════════════════════════════════════════════════════════════════════

describe("writePersistedSession", () => {
  it("serializes the snapshot to localStorage", () => {
    const snapshot = makeSnapshot({ currentIndex: 3 })
    writePersistedSession(snapshot)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify(snapshot)
    )
  })

  it("swallows a quota/unavailable error instead of throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError")
    })
    expect(() => writePersistedSession(makeSnapshot())).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// clearPersistedSession - swallows storage failures
// ═══════════════════════════════════════════════════════════════════════════

describe("clearPersistedSession", () => {
  it("removes the persisted snapshot", () => {
    writePersistedSession(makeSnapshot())
    clearPersistedSession()
    expect(readPersistedSession()).toBeNull()
  })

  it("swallows an error instead of throwing", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("boom")
    })
    expect(() => clearPersistedSession()).not.toThrow()
  })
})
