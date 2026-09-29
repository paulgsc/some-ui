import { ActiveScope } from "@common/lib/lifetime/active-scope"
import { Disposables } from "@common/lib/lifetime/disposables"
import { probeResources } from "@common/testing/resource-probe"
import type { ResourceProbe } from "@common/testing/resource-probe"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let probe: ResourceProbe
beforeEach(() => {
  probe = probeResources()
})
afterEach(() => probe.restore())

describe("ActiveScope", () => {
  it("acquires only while nothing holds it, and releases on any hold", () => {
    const life = new Disposables()
    const start = vi.fn((scope: Disposables) => scope.interval(() => {}, 1_000))
    const active = new ActiveScope<"entering" | "min" | "hidden">(life, start, [
      "entering",
    ])
    expect(active.active).toBe(false)
    expect(probe.counts().intervals).toBe(0)

    active.release("entering")
    expect(active.active).toBe(true)
    expect(probe.counts().intervals).toBe(1)

    active.hold("min")
    active.hold("hidden")
    expect(probe.counts().intervals).toBe(0)
    active.release("min")
    expect(probe.counts().intervals).toBe(0) // still hidden
    active.release("hidden")
    expect(probe.counts().intervals).toBe(1)
    expect(start).toHaveBeenCalledTimes(2)

    life.dispose()
    expect(active.active).toBe(false)
    expect(probe.counts()).toEqual(probe.baseline)
  })

  it("never starts once its parent has ended", () => {
    const life = new Disposables()
    const start = vi.fn()
    const active = new ActiveScope(life, start, ["held"])
    life.dispose()
    active.release("held")
    expect(start).not.toHaveBeenCalled()
  })
})
