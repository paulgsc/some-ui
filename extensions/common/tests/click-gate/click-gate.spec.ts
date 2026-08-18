/**
 * ClickGate unit tests.
 *
 * The gate is pure timer logic over an injected callback, so these run entirely
 * in the Playwright test-runner (Node.js) process — no browser page required,
 * same as the migration-ledger suite.
 *
 * The behaviour under test is the one the gate exists for: a double-click must
 * not also commit a single-click on its way through, because the browser fires
 * the whole single-click sequence first.
 */

import { ClickGate, DEFAULT_DBLCLICK_WINDOW_MS } from "@common/lib/click-gate"
import { expect, test } from "@playwright/test"

type Event = "CLICK" | "DBLCLICK"

const EVENTS = { single: "CLICK", double: "DBLCLICK" } as const

function makeGate(windowMs?: number): {
  gate: ClickGate<Event>
  commits: Array<Event>
} {
  const commits: Array<Event> = []
  const gate = new ClickGate<Event>(
    (e) => commits.push(e),
    EVENTS,
    windowMs ?? 20
  )
  return { gate, commits }
}

function after(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─────────────────────────────────────────────────────────────────────────────
// Single click
// ─────────────────────────────────────────────────────────────────────────────

test("a lone click commits the single payload after the window", async () => {
  const { gate, commits } = makeGate()

  gate.rawClick()
  expect(commits, "nothing commits synchronously").toEqual([])

  await after(40)
  expect(commits).toEqual(["CLICK"])
})

// ─────────────────────────────────────────────────────────────────────────────
// Double click — the reason the gate exists
// ─────────────────────────────────────────────────────────────────────────────

test("the real dblclick sequence commits DBLCLICK exactly once", async () => {
  const { gate, commits } = makeGate()

  // Exactly what the browser emits: click, click, dblclick.
  gate.rawClick()
  gate.rawClick()
  gate.rawDblClick()

  await after(40)
  expect(commits, "no stray CLICK on the way to DBLCLICK").toEqual(["DBLCLICK"])
})

test("a second click inside the window cancels the staged single", async () => {
  const { gate, commits } = makeGate()

  gate.rawClick()
  gate.rawClick()

  await after(40)
  expect(commits, "the cancelled single never fires on its own").toEqual([])
})

test("a second click after the window is its own interaction", async () => {
  const { gate, commits } = makeGate()

  gate.rawClick()
  await after(40)
  gate.rawClick()
  await after(40)

  expect(commits).toEqual(["CLICK", "CLICK"])
})

// ─────────────────────────────────────────────────────────────────────────────
// Teardown
// ─────────────────────────────────────────────────────────────────────────────

test("destroy() cancels a staged commit and is idempotent", async () => {
  const { gate, commits } = makeGate()

  gate.rawClick()
  gate.destroy()
  gate.destroy()

  await after(40)
  expect(commits).toEqual([])
})

test("destroy() does not suppress a later dblclick commit", () => {
  const { gate, commits } = makeGate()

  gate.rawClick()
  gate.destroy()
  gate.rawDblClick()

  expect(commits).toEqual(["DBLCLICK"])
})

// ─────────────────────────────────────────────────────────────────────────────
// Payload / window are the caller's, not the commons'
// ─────────────────────────────────────────────────────────────────────────────

test("the gate emits the caller's payloads verbatim", async () => {
  const commits: Array<{ tag: string }> = []
  const single = { tag: "expand" }
  const double = { tag: "pin" }
  const gate = new ClickGate<{ tag: string }>(
    (e) => commits.push(e),
    { single, double },
    20
  )

  gate.rawDblClick()
  expect(commits[0], "the exact object, not a copy").toBe(double)

  gate.rawClick()
  await after(40)
  expect(commits[1]).toBe(single)
})

test("the default window is the platform double-click threshold", () => {
  expect(DEFAULT_DBLCLICK_WINDOW_MS).toBe(300)
})
