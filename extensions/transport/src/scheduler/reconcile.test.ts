import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createCoalescer } from "./reconcile"

describe("scheduler/reconcile — createCoalescer", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("a burst of N triggers within one debounce window fires onFire exactly once", () => {
    const onFire = vi.fn()
    const coalescer = createCoalescer({ debounceMs: 50 }, onFire)

    for (let i = 0; i < 10; i++) {
      coalescer.trigger()
      vi.advanceTimersByTime(10) // stays within the 50ms window each time
    }

    expect(onFire).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)

    expect(onFire).toHaveBeenCalledTimes(1)
  })

  it("triggers separated by more than the debounce window fire independently", () => {
    const onFire = vi.fn()
    const coalescer = createCoalescer({ debounceMs: 50 }, onFire)

    coalescer.trigger()
    vi.advanceTimersByTime(60)
    expect(onFire).toHaveBeenCalledTimes(1)

    coalescer.trigger()
    vi.advanceTimersByTime(60)
    expect(onFire).toHaveBeenCalledTimes(2)
  })

  it("dispose() cancels a pending coalesced invocation", () => {
    const onFire = vi.fn()
    const coalescer = createCoalescer({ debounceMs: 50 }, onFire)

    coalescer.trigger()
    coalescer.dispose()
    vi.advanceTimersByTime(1000)

    expect(onFire).not.toHaveBeenCalled()
  })

  it("decides only *when*, never *what* — onFire takes no arguments describing a decision", () => {
    const onFire = vi.fn()
    const coalescer = createCoalescer({ debounceMs: 10 }, onFire)
    coalescer.trigger()
    vi.advanceTimersByTime(10)
    expect(onFire).toHaveBeenCalledWith()
  })
})
