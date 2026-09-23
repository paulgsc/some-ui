import {
  ENFORCEMENT_LIVENESS_MS,
  ensureEnforcement,
  removeEnforcement,
  type EnforcementDeps,
  type EnforcementRequest,
} from "@filter/lib/content/enforcement-handshake"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const BG0 = "#171c25"
const ENFORCED = "rgb(23, 28, 37)"
const NATIVE = "rgb(255, 255, 255)"

type Fake = {
  deps: EnforcementDeps
  sent: Array<EnforcementRequest>
  /** Copies of the sheet in the fake cascade — insertCSS stacks, removeCSS takes one. */
  copies: number
  frozen: number
  events: Array<string>
}

/**
 * A background that inserts/removes one copy per request (measured: two
 * identical insertCSS calls stack on Chromium 1194), with the cascade read
 * reporting `bg0` while any copy is present. `respond` decides whether a
 * request is answered at all.
 */
function fake(
  options: {
    initialCopies?: number
    respond?: (request: EnforcementRequest, index: number) => boolean
    applies?: (request: EnforcementRequest, index: number) => boolean
  } = {}
): Fake {
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextTimer = 0
  const state: Omit<Fake, "deps"> = {
    sent: [],
    copies: options.initialCopies ?? 0,
    frozen: 0,
    events: [],
  }
  const deps: EnforcementDeps = {
    send: (request): Promise<unknown> => {
      const index = state.sent.length
      state.sent.push(request)
      state.events.push(`send:${request.type}`)
      if (options.respond?.(request, index) === false) {
        return new Promise(() => {})
      }
      if (options.applies?.(request, index) !== false) {
        state.copies += request.type === "ENSURE_ENFORCEMENT" ? 1 : -1
        state.copies = Math.max(0, state.copies)
      }
      return Promise.resolve({ ok: true })
    },
    readCanvas: (): string => (state.copies > 0 ? ENFORCED : NATIVE),
    freeze: (): (() => void) => {
      state.frozen++
      state.events.push("freeze")
      return (): void => {
        state.frozen--
        state.events.push("unfreeze")
      }
    },
    afterPaint: (): Promise<void> => {
      state.events.push("paint")
      return Promise.resolve()
    },
    setTimer: (fn, ms): unknown => {
      const id = nextTimer++
      timers.set(id, setTimeout(fn, ms))
      return id
    },
    clearTimer: (handle): void => {
      if (typeof handle !== "number") return
      clearTimeout(timers.get(handle))
      timers.delete(handle)
    },
  }
  return Object.assign(state, { deps })
}

describe("ensureEnforcement", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("requests once, confirms by reading the cascade, and holds the freeze until after a paint", async () => {
    const f = fake()
    const outcome = await ensureEnforcement(f.deps, "default", BG0)
    expect(outcome).toEqual({ kind: "confirmed", sent: 1 })
    expect(f.sent).toEqual([
      { type: "ENSURE_ENFORCEMENT", swatchId: "default" },
    ])
    // Freeze before the request, removed only after the confirm read and a
    // painted frame (the #1462 transition finding).
    expect(f.events).toEqual([
      "freeze",
      "send:ENSURE_ENFORCEMENT",
      "paint",
      "unfreeze",
    ])
    expect(f.frozen).toBe(0)
  })

  it("sends nothing when the sheet already reads as present (idempotent: insertCSS stacks copies)", async () => {
    const f = fake({ initialCopies: 1 })
    const outcome = await ensureEnforcement(f.deps, "default", BG0)
    expect(outcome).toEqual({ kind: "confirmed", sent: 0 })
    expect(f.sent).toEqual([])
    expect(f.copies).toBe(1)
  })

  it("re-sends exactly once when the first answer arrives before the sheet is in the cascade", async () => {
    // A worker mid-restart can answer before its insertCSS promise settles.
    const f = fake({ applies: (_r, index) => index > 0 })
    const outcome = await ensureEnforcement(f.deps, "default", BG0)
    expect(outcome).toEqual({ kind: "confirmed", sent: 2 })
  })

  it("times out after the liveness bound when the background never answers, and removes the freeze", async () => {
    const f = fake({ respond: () => false })
    const pending = ensureEnforcement(f.deps, "default", BG0)
    await vi.advanceTimersByTimeAsync(ENFORCEMENT_LIVENESS_MS - 1)
    expect(f.frozen).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await pending).toEqual({ kind: "timeout", sent: 1 })
    expect(f.frozen).toBe(0)
  })

  it("times out, rather than confirming, when both answers leave the sheet absent", async () => {
    const f = fake({ applies: () => false })
    const pending = ensureEnforcement(f.deps, "default", BG0)
    await vi.advanceTimersByTimeAsync(ENFORCEMENT_LIVENESS_MS)
    // The timeout bounds waiting; it is never read as evidence.
    expect(await pending).toEqual({ kind: "timeout", sent: 2 })
  })

  it("treats a rejected sendMessage as no answer, not as a failure to report early", async () => {
    const f = fake()
    const deps: EnforcementDeps = {
      ...f.deps,
      send: () => Promise.reject(new Error("Receiving end does not exist")),
    }
    const pending = ensureEnforcement(deps, "default", BG0)
    let settled = false
    void pending.then(() => (settled = true))
    await vi.advanceTimersByTimeAsync(ENFORCEMENT_LIVENESS_MS - 1)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending).kind).toBe("timeout")
  })
})

describe("removeEnforcement", () => {
  it("removes until the read shows the sheet gone — one request per stacked copy", async () => {
    const f = fake({ initialCopies: 2 })
    expect(await removeEnforcement(f.deps, "default", BG0)).toBe(true)
    expect(f.sent).toEqual([
      { type: "REMOVE_ENFORCEMENT", swatchId: "default" },
      { type: "REMOVE_ENFORCEMENT", swatchId: "default" },
    ])
    expect(f.copies).toBe(0)
  })

  it("sends nothing when the sheet is already absent", async () => {
    const f = fake()
    expect(await removeEnforcement(f.deps, "default", BG0)).toBe(true)
    expect(f.sent).toEqual([])
  })

  it("gives up after a bounded number of requests that remove nothing", async () => {
    const f = fake({ initialCopies: 1, applies: () => false })
    expect(await removeEnforcement(f.deps, "default", BG0)).toBe(false)
    expect(f.sent.length).toBe(3)
  })
})
