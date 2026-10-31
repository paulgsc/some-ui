/**
 * SI1's other half: `newSessionId` makes only ids `is_session_id` takes, so
 * the type `CreateSessionInput.id` demands is one every store accepts.
 */
import { afterEach, expect, it, vi } from "vitest"

import { isSessionId, newSessionId } from "@/lib/tenant/session-id"

afterEach(() => {
  vi.unstubAllGlobals()
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
