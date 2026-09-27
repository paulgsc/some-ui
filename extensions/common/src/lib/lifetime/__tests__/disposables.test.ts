import { Disposables } from "@common/lib/lifetime/disposables"
import { probeResources } from "@common/testing/resource-probe"
import type { ResourceProbe } from "@common/testing/resource-probe"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let probe: ResourceProbe
beforeEach(() => {
  probe = probeResources()
})
afterEach(() => probe.restore())

const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => r()))

describe("Disposables", () => {
  it("releases everything it acquired, newest first", () => {
    const life = new Disposables()
    const order: Array<string> = []
    life.add(() => order.push("first"))
    life.interval(() => {}, 1_000)
    life.timeout(() => {}, 1_000)
    life.frame(() => {})
    life.loop(() => {})
    document.addEventListener("pointermove", () => {}, { signal: life.signal })
    life.add(() => order.push("last"))

    expect(probe.counts()).toMatchObject({
      intervals: 1,
      timeouts: 1,
      frames: 2,
      pageListeners: 1,
    })
    life.dispose()
    expect(probe.counts()).toEqual(probe.baseline)
    expect(order).toEqual(["last", "first"])
  })

  it("keeps a loop running every frame until disposed", async () => {
    const life = new Disposables()
    const tick = vi.fn()
    life.loop(tick)
    await nextFrame()
    await nextFrame()
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(1)
    life.dispose()
    const calls = tick.mock.calls.length
    await nextFrame()
    await nextFrame()
    expect(tick).toHaveBeenCalledTimes(calls)
    expect(probe.counts().frames).toBe(0)
  })

  it("releases at once anything acquired after it ended", () => {
    const life = new Disposables()
    life.dispose()
    const late = vi.fn()
    life.add(late)
    life.interval(() => {}, 1_000)
    life.loop(() => {})
    expect(late).toHaveBeenCalledOnce()
    expect(probe.counts()).toEqual(probe.baseline)
  })

  it("ends children with it, and forgets children that end first", () => {
    const life = new Disposables()
    const early = life.child()
    early.interval(() => {}, 1_000)
    early.dispose()
    const late = life.child()
    late.interval(() => {}, 1_000)
    expect(probe.counts().intervals).toBe(1)
    life.dispose()
    expect(late.disposed).toBe(true)
    expect(probe.counts().intervals).toBe(0)
  })

  it("runs every disposer even when one throws", () => {
    const life = new Disposables()
    const after = vi.fn()
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    life.add(after)
    life.add(() => {
      throw new Error("boom")
    })
    life.dispose()
    expect(after).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})
