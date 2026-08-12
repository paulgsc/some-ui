/**
 * SessionId unit tests.
 *
 * mkSession() is a pure counter, so these run in the Playwright test-runner
 * (Node.js) process — no browser page required.
 *
 * The property that matters is the one the post-await guard rests on: two
 * lifecycles never share a token, and a token minted later never compares equal
 * to one minted earlier.
 */

import { expect, test } from "@playwright/test"

import { mkSession } from "../../src/lib/session"

test("every mint is distinct", () => {
  const ids = Array.from({ length: 100 }, () => mkSession())
  expect(new Set(ids).size, "no two sessions collide").toBe(ids.length)
})

test("mints are strictly increasing", () => {
  const a = mkSession()
  const b = mkSession()
  const c = mkSession()

  expect(b).toBeGreaterThan(a)
  expect(c).toBeGreaterThan(b)
})

test("a stale token never compares equal to the current one", () => {
  // The exact shape of the guard in VideoManager._promote: capture before the
  // await, compare after. A teardown+restart in between must be detectable.
  const captured = mkSession()
  const afterRestart = mkSession()

  expect(captured === afterRestart).toBe(false)
  expect(captured === captured).toBe(true)
})
