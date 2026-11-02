/**
 * SI1's other half: `newSessionId` makes only ids `is_session_id` takes, so
 * the type `CreateSessionInput.id` demands is one every store accepts.
 *
 * And `generateId`'s half of RB1 (`packages/ui/topik/ROUTINE.md`): the
 * reflections routine names a session by its id's last 8 characters, so they
 * are the random part of every id `newSessionId` makes.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { isSessionId, newSessionId } from "@/lib/tenant/session-id"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it("takes what file_host's is_session_id takes, and nothing else", () => {
  expect(isSessionId(`session-${"a".repeat(16)}`)).toBe(true)
  expect(isSessionId(`session-${"a".repeat(56)}`)).toBe(true)
  expect(isSessionId("session-a_b-C9d0e1f2g3h4")).toBe(true)
  // #2263 made the phone hold creates to this; "Next lesson" sent a bare UUID.
  expect(isSessionId(crypto.randomUUID())).toBe(false)
  expect(isSessionId(`session-${"a".repeat(15)}`)).toBe(false)
  expect(isSessionId(`session-${"a".repeat(57)}`)).toBe(false)
  expect(isSessionId(`session-${"a".repeat(15)}.`)).toBe(false)
  expect(isSessionId(`sessions-${"a".repeat(16)}`)).toBe(false)
})

it("mints ids it takes, with crypto.randomUUID", () => {
  expect(newSessionId).not.toThrow()
})

it("mints ids it takes where crypto.randomUUID is missing", () => {
  vi.stubGlobal("crypto", {})
  expect(newSessionId).not.toThrow()
})

describe("RB1: a session id's last 8 are its random part", () => {
  const UUID = "3f1c9a2e-8b7d-4e6f-a5c4-91d2e7b06a1f"
  const RANDOM = 0.5732651

  it("with crypto.randomUUID, they are the UUID's last 8", () => {
    vi.stubGlobal("crypto", { randomUUID: () => UUID })
    vi.spyOn(Math, "random").mockReturnValue(RANDOM)
    expect(newSessionId().slice(-8)).toBe(UUID.slice(-8))
  })

  it("where crypto.randomUUID is missing, they are Math.random's", () => {
    vi.stubGlobal("crypto", {})
    vi.spyOn(Math, "random").mockReturnValue(RANDOM)
    const random = RANDOM.toString(36).slice(2, 10)
    expect(random).toHaveLength(8)
    expect(newSessionId().slice(-8)).toBe(random)
  })
})
