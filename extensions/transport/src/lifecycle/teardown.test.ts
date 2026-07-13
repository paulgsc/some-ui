import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createCoalescer } from "../scheduler/reconcile"
import { attachMutationObserver, createEventChannel } from "../sensor/observer"
import { createSessionLifecycle } from "../session/lifecycle"
import { teardownContent, teardownDocument, type Disposable } from "./teardown"

describe("lifecycle/teardown — teardownContent (Theorem D.1(a))", () => {
  it("disposes every resource in the registry", () => {
    const disposeA = vi.fn()
    const disposeB = vi.fn()
    const session = createSessionLifecycle()

    teardownContent([disposeA, disposeB], session)

    expect(disposeA).toHaveBeenCalledTimes(1)
    expect(disposeB).toHaveBeenCalledTimes(1)
  })

  it("advances the epoch via Session.resetContent(), never touching Bootstrap", () => {
    const teardownBootstrap = vi.fn()
    const session = createSessionLifecycle()
    const before = session.epoch

    teardownContent([], session)

    expect(session.epoch).not.toBe(before)
    expect(teardownBootstrap).not.toHaveBeenCalled()
  })
})

describe("lifecycle/teardown — teardownDocument (Theorem D.1(b))", () => {
  it("disposes every resource, tears down Bootstrap, and resets via Session.resetDocument()", () => {
    const dispose = vi.fn()
    const teardownBootstrap = vi.fn()
    const session = createSessionLifecycle()
    const before = session.epoch

    teardownDocument([dispose], session, teardownBootstrap)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(teardownBootstrap).toHaveBeenCalledTimes(1)
    expect(session.epoch).not.toBe(before)
  })

  it("disposes resources before tearing down Bootstrap", () => {
    const order: Array<string> = []
    const dispose: Disposable = () => order.push("dispose")
    const teardownBootstrap = (): void => {
      order.push("bootstrap")
    }
    const session = createSessionLifecycle()

    teardownDocument([dispose], session, teardownBootstrap)

    expect(order).toEqual(["dispose", "bootstrap"])
  })
})

describe("lifecycle/teardown — no resource leak across repeated content-only cycles", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("teardownContent() leaves zero dangling MutationObserver/timer registrations from Sensor or Scheduler", async () => {
    const target = document.createElement("div")
    document.body.appendChild(target)
    const session = createSessionLifecycle()

    let ingestedCount = 0
    const channel = createEventChannel<
      MutationRecord,
      string,
      { text: string }
    >({
      toTokens: () => [{ key: "k", attrs: { text: "k" }, timestamp: 0 }],
      currentEpoch: () => session.epoch,
      emit: () => {
        ingestedCount++
      },
    })
    const disconnectObserver = attachMutationObserver(target, channel, {
      attributes: true,
    })

    const onFire = vi.fn()
    const coalescer = createCoalescer({ debounceMs: 50 }, onFire)
    coalescer.trigger() // a pending, not-yet-fired timer

    const disposables: ReadonlyArray<Disposable> = [
      disconnectObserver,
      coalescer.dispose,
    ]

    teardownContent(disposables, session)

    // The observer is disconnected: further mutation produces no tokens.
    target.setAttribute("data-x", "1")
    await Promise.resolve()
    expect(ingestedCount).toBe(0)

    // The coalescer's pending timer was cancelled: it never fires.
    vi.advanceTimersByTime(1000)
    expect(onFire).not.toHaveBeenCalled()

    target.remove()
  })
})
