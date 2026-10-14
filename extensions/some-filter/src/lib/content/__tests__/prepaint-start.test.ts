/**
 * `public/prepaint-start.js`, the `document_start` veil, run as the browser
 * runs it: its source evaluated against this test's document.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  disablePrepaint,
  enablePrepaint,
  PREPAINT_VEIL_ID,
  VEIL_MAX_HOLD_MS,
} from "@filter/lib/content/prepaint"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vitest runs from the package root, as pipeline.test.ts relies on too.
const SOURCE = readFileSync(
  join(process.cwd(), "public/prepaint-start.js"),
  "utf-8"
)

declare global {
  var __swPrepaintExpired: boolean | undefined
  var __swOnPrepaintExpired: (() => void) | undefined
}

/** Every observer the script makes, so a test can stop them all afterwards. */
const observers: Array<MutationObserver> = []
class TrackedObserver extends MutationObserver {
  constructor(callback: MutationCallback) {
    super(callback)
    observers.push(this)
  }
}

let visibility: DocumentVisibilityState = "visible"

function runScript(): void {
  // eslint-disable-next-line no-new-func -- the script under test is a plain public file; this evaluates it as the browser does
  new Function(SOURCE)()
}

/** The per-tab cache content.ts and prepaint-start.js share (content.ts's own exemption). */
// eslint-disable-next-line extension-charter/no-raw-storage
const tabCache = (): Storage => sessionStorage

const veil = (): HTMLElement | null => document.getElementById(PREPAINT_VEIL_ID)
const dirty = (): boolean =>
  document.documentElement.classList.contains("sw-dirty")

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("MutationObserver", TrackedObserver)
  visibility = "visible"
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  })
  tabCache().clear()
  globalThis.__swPrepaintExpired = undefined
  globalThis.__swOnPrepaintExpired = undefined
})

afterEach(() => {
  for (const observer of observers.splice(0)) observer.disconnect()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  Reflect.deleteProperty(document, "visibilityState")
  veil()?.remove()
  document.documentElement.classList.remove("sw-dirty")
  tabCache().clear()
})

describe("prepaint-start.js", () => {
  it("carries the same bound as prepaint.ts", () => {
    const match = /let VEIL_MAX_HOLD_MS = (\d+)/.exec(SOURCE)
    expect(Number(match?.[1])).toBe(VEIL_MAX_HOLD_MS)
  })

  it("puts the veil up at once", () => {
    runScript()
    expect(veil()).not.toBeNull()
    expect(dirty()).toBe(true)
  })

  it("takes its own veil down at VEIL_MAX_HOLD_MS with nothing else running, and says so", () => {
    const hook = vi.fn()
    globalThis.__swOnPrepaintExpired = hook
    runScript()

    vi.advanceTimersByTime(VEIL_MAX_HOLD_MS - 1)
    expect(veil()).not.toBeNull()
    vi.advanceTimersByTime(1)

    expect(veil()).toBeNull()
    expect(dirty()).toBe(false)
    expect(globalThis.__swPrepaintExpired).toBe(true)
    expect(hook).toHaveBeenCalledTimes(1)
  })

  it("stops self-healing once it has expired", async () => {
    runScript()
    vi.advanceTimersByTime(VEIL_MAX_HOLD_MS)

    document.documentElement.classList.add("sw-dirty")
    document.documentElement.appendChild(document.createElement("i"))
    await Promise.resolve()

    expect(veil()).toBeNull()
    document.documentElement.querySelector(":scope > i")?.remove()
  })

  it("still self-heals before the bound", async () => {
    runScript()
    veil()?.remove()
    await Promise.resolve()
    expect(veil()).not.toBeNull()
  })

  it("starts a hidden document's clock when it is first shown", () => {
    visibility = "hidden"
    runScript()
    vi.advanceTimersByTime(VEIL_MAX_HOLD_MS * 4)
    expect(veil()).not.toBeNull()

    visibility = "visible"
    document.dispatchEvent(new Event("visibilitychange"))
    vi.advanceTimersByTime(VEIL_MAX_HOLD_MS - 1)
    expect(veil()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(veil()).toBeNull()
  })

  it("puts up no veil on a tab cached as off", () => {
    tabCache().setItem("__sw_tab_state", "off")
    runScript()
    expect(veil()).toBeNull()
    expect(dirty()).toBe(false)
    expect(observers).toHaveLength(0)
  })

  it("still veils a tab cached as legacy or auto", () => {
    tabCache().setItem("__sw_tab_state", "legacy")
    runScript()
    expect(veil()).not.toBeNull()
  })

  it("leaves a veil content.js raised after a release to that veil's own clock", () => {
    runScript()
    vi.advanceTimersByTime(VEIL_MAX_HOLD_MS - 100)
    disablePrepaint()
    enablePrepaint()

    vi.advanceTimersByTime(100)
    expect(veil()).not.toBeNull()
    expect(globalThis.__swPrepaintExpired).toBeUndefined()

    vi.advanceTimersByTime(VEIL_MAX_HOLD_MS - 100)
    expect(veil()).toBeNull()
  })

  it("does take down its own veil that content.js only re-affirmed", () => {
    runScript()
    vi.advanceTimersByTime(1000)
    enablePrepaint()
    vi.advanceTimersByTime(VEIL_MAX_HOLD_MS - 1000)
    expect(veil()).toBeNull()
    expect(globalThis.__swPrepaintExpired).toBe(true)
  })
})
