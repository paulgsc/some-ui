/**
 * @vitest-environment jsdom
 *
 * The drag-down's runtime over a real scroller's touches (PULL0): a pull at
 * the top checks again once, a drag anywhere else is the page's own, a check
 * that never answers ends at its deadline, and an answer that lands after the
 * page moved on, or after the gesture was taken away, paints nothing, while
 * the check still holds the next pull until it ends.
 */
import { fireEvent } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ARM_PX,
  CHECK_MS,
  DONE_MS,
  FAILED_MS,
  RESISTANCE,
} from "@/lib/pull-refresh/model"
import type { CheckEnd } from "@/lib/pull-refresh/model"
import type { PullPorts, PullRuntime } from "@/lib/pull-refresh/runtime"
import { atTop, createPullRuntime } from "@/lib/pull-refresh/runtime"

const AT = 1_762_000_000_000

type Pending = {
  resolve: (end?: CheckEnd) => void
  reject: (error: Error) => void
}

let scroller: HTMLDivElement
let inner: HTMLDivElement
let reads: Array<Pending>
let leave: Array<() => void>
let runtime: PullRuntime
let detach: () => void

const ports = (): PullPorts => ({
  readAgain: () =>
    new Promise<CheckEnd>((resolve, reject) =>
      reads.push({ resolve: (end = { kind: "read" }) => resolve(end), reject })
    ),
  onLeave: (listener) => {
    leave.push(listener)
    return () => {
      leave = leave.filter((l) => l !== listener)
    }
  },
  now: () => AT,
})

const touch = (y: number, x = 100): { touches: Array<Partial<Touch>> } => ({
  touches: [{ clientX: x, clientY: y, identifier: 0 }],
})

/** A finger down at the top of `on`, dragged `dy` down, and let go. */
function drag(dy: number, on: Element = inner): void {
  fireEvent.touchStart(on, touch(50))
  fireEvent.touchMove(on, touch(50 + 20))
  fireEvent.touchMove(on, touch(50 + dy))
  fireEvent.touchEnd(on, { touches: [] })
}

const FAR = ARM_PX / RESISTANCE + 20
const kind = (): string => runtime.getState().phase.kind
/** Lets a settled read's continuation run. */
const flush = (): Promise<void> => Promise.resolve().then(() => undefined)

beforeEach(() => {
  vi.useFakeTimers()
  reads = []
  leave = []
  scroller = document.createElement("div")
  inner = document.createElement("div")
  scroller.append(inner)
  document.body.append(scroller)
  runtime = createPullRuntime(ports())
  detach = runtime.attach(scroller)
})

afterEach(() => {
  detach()
  scroller.remove()
  vi.useRealTimers()
})

describe("a pull from the top of the page", () => {
  it("arms past ARM_PX, checks again once on letting go, and says it is done", async () => {
    fireEvent.touchStart(inner, touch(50))
    fireEvent.touchMove(inner, touch(50 + 30))
    expect(kind()).toBe("pulling")
    fireEvent.touchMove(inner, touch(50 + FAR))
    expect(kind()).toBe("armed")
    fireEvent.touchEnd(inner, { touches: [] })
    expect(kind()).toBe("checking")
    expect(reads).toHaveLength(1)

    reads[0].resolve()
    await flush()
    expect(runtime.getState().phase).toEqual({ kind: "done", pull: 1, at: AT })

    vi.advanceTimersByTime(DONE_MS)
    expect(kind()).toBe("idle")
  })

  it("says so when something could not be read, for longer", async () => {
    drag(FAR)
    reads[0].reject(new Error("offline"))
    await flush()
    expect(kind()).toBe("failed")
    vi.advanceTimersByTime(DONE_MS)
    expect(kind()).toBe("failed")
    vi.advanceTimersByTime(FAILED_MS - DONE_MS)
    expect(kind()).toBe("idle")
  })

  it("does nothing when let go short of ARM_PX", () => {
    drag(40)
    expect(kind()).toBe("idle")
    expect(reads).toHaveLength(0)
  })

  it("ends a check that never answers at its deadline, and takes the next pull", async () => {
    // A read paused mid-retry by a lost connection never settles.
    drag(FAR)
    vi.advanceTimersByTime(CHECK_MS - 1)
    expect(kind()).toBe("checking")
    vi.advanceTimersByTime(1)
    expect(runtime.getState().phase).toEqual({
      kind: "failed",
      pull: 1,
      at: AT,
      offline: false,
      unread: [],
    })
    drag(FAR)
    expect(reads).toHaveLength(2)
    // The first read, answering at last, says nothing over the second.
    reads[0].resolve()
    await flush()
    expect(runtime.getState().phase).toMatchObject({
      kind: "checking",
      pull: 2,
    })
  })

  it("tells its subscribers only when something changed", () => {
    const heard = vi.fn()
    runtime.subscribe(heard)
    fireEvent.touchEnd(inner, { touches: [] })
    expect(heard).not.toHaveBeenCalled()
    fireEvent.touchStart(inner, touch(50))
    expect(heard).toHaveBeenCalledTimes(1)
  })
})

describe("a drag that is the page's own", () => {
  it("never arms with the page scrolled down", () => {
    document.documentElement.scrollTop = 200
    drag(FAR)
    document.documentElement.scrollTop = 0
    expect(reads).toHaveLength(0)
  })

  it("never arms in a list scrolled down inside the page", () => {
    inner.scrollTop = 80
    drag(FAR)
    expect(reads).toHaveLength(0)
  })

  it("reads the document and every box under the finger", () => {
    expect(atTop(inner, scroller)).toBe(true)
    scroller.scrollTop = 10
    expect(atTop(inner, scroller)).toBe(false)
    scroller.scrollTop = 0
    expect(atTop(null, scroller)).toBe(true)
  })

  it("never arms for two fingers", () => {
    fireEvent.touchStart(inner, {
      touches: [
        { clientX: 100, clientY: 50, identifier: 0 },
        { clientX: 200, clientY: 50, identifier: 1 },
      ],
    })
    fireEvent.touchMove(inner, touch(50 + FAR))
    fireEvent.touchEnd(inner, { touches: [] })
    expect(reads).toHaveLength(0)
  })
})

describe("an answer that lands late", () => {
  it("paints nothing once the page moved to another route, and holds the next pull until it ends", async () => {
    drag(FAR)
    leave.forEach((listener) => listener())
    expect(runtime.getState().phase).toEqual({
      kind: "checking",
      pull: 1,
      shown: false,
    })
    // One check at a time, across routes too.
    drag(FAR)
    expect(reads).toHaveLength(1)
    reads[0].resolve()
    await flush()
    expect(kind()).toBe("idle")
    drag(FAR)
    expect(reads).toHaveLength(2)
  })

  it("paints nothing once the gesture was taken away, which leaves the page as it was", async () => {
    const root = document.documentElement
    detach()
    root.style.overscrollBehaviorY = "auto"
    detach = runtime.attach(scroller)
    expect(root.style.overscrollBehaviorY).toBe("none")

    drag(FAR)
    detach()
    detach = (): void => undefined
    expect(root.style.overscrollBehaviorY).toBe("auto")
    expect(leave).toHaveLength(0)
    reads[0].resolve()
    await flush()
    expect(kind()).toBe("idle")

    // And no longer listens.
    drag(FAR)
    expect(reads).toHaveLength(1)
  })
})
