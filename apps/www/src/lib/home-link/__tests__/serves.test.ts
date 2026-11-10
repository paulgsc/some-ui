/**
 * Whether home works with this build (#2843): what home's answer means, when
 * the phone asks, and that an answer from before an unpairing never lands.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CompatAsked } from "@/lib/home-link/compat-read"
import type { HomeLinkState } from "@/lib/home-link/model"
import { INITIAL } from "@/lib/home-link/model"
import type { ServesWatchPorts } from "@/lib/home-link/serves"
import {
  createServes,
  servesRefresher,
  watchServes,
} from "@/lib/home-link/serves"
import {
  INITIAL_SERVES,
  MISSING_GAP,
  servesOf,
  step,
} from "@/lib/home-link/serves-model"

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (): never => {
    throw new Error("unused")
  },
}))

const answer = (body: unknown, status = 200): CompatAsked => ({
  kind: "answered",
  answer: { status, body: JSON.stringify(body) },
})

const PAIRED: HomeLinkState = {
  ...INITIAL,
  link: {
    kind: "paired",
    base: "https://home.example/api/v1",
    id: "p1",
    notForgotten: true,
  },
}
const UNPAIRED: HomeLinkState = {
  ...INITIAL,
  link: { kind: "unpaired", note: null },
}

describe("what home's answer says", () => {
  it("reads each answer home gives, and nothing from what isn't one", () => {
    const of = (deploy: string): ReturnType<typeof servesOf> =>
      servesOf({
        status: 200,
        body: JSON.stringify({ supported: false, deploy }),
      })
    expect(
      servesOf({
        status: 200,
        body: JSON.stringify({ supported: true, deploy: "none" }),
      })
    ).toBe("fits")
    expect(of("client_behind")).toBe("too-old")
    expect(of("wanted")).toBe("updating")
    expect(of("in_flight")).toBe("updating")
    for (const deploy of [
      "unavailable",
      "cooldown",
      "refused",
      "cannot_request",
      "later",
    ]) {
      expect(of(deploy)).toBe("not-yet")
    }
    // A home older than the ask answers not found: nothing is known.
    expect(servesOf({ status: 404, body: "" })).toBeNull()
    expect(servesOf({ status: 200, body: "not json" })).toBeNull()
    expect(servesOf({ status: 200, body: "{}" })).toBeNull()
  })
})

describe("the model", () => {
  it("asks one at a time, and a not-found at most once a minute", () => {
    const asked = step(INITIAL_SERVES, { type: "ask", why: "start", at: 0 })
    expect(asked.asking).toBe(true)
    expect(step(asked, { type: "ask", why: "front", at: 1 })).toBe(asked)
    const done = step(asked, { type: "answered", serves: "fits" })
    expect(done).toMatchObject({ serves: "fits", asking: false })
    const tooSoon = {
      type: "ask",
      why: "missing",
      at: MISSING_GAP - 1,
    } as const
    expect(step(done, tooSoon)).toBe(done)
    expect(
      step(done, { type: "ask", why: "missing", at: MISSING_GAP }).asking
    ).toBe(true)
    // The foreground asks whenever it comes, a minute or not.
    expect(step(done, { type: "ask", why: "front", at: 1 }).asking).toBe(true)
  })

  it("keeps what home said through no answer, and forgets it unpaired", () => {
    const known = { serves: "updating", asking: true, askedAt: 0 } as const
    expect(step(known, { type: "unanswered" })).toMatchObject({
      serves: "updating",
      asking: false,
    })
    expect(step(known, { type: "unpaired" })).toBe(INITIAL_SERVES)
  })
})

/** A link and a document the watch can be driven through. */
function world(state: HomeLinkState): {
  ports: ServesWatchPorts
  set: (next: HomeLinkState) => void
  front: (visible: boolean) => void
  missing: () => void
} {
  let current = state
  const linkListeners = new Set<() => void>()
  const missingListeners = new Set<() => void>()
  let visibility: DocumentVisibilityState = "visible"
  class Front extends EventTarget {
    get visibilityState(): DocumentVisibilityState {
      return visibility
    }
  }
  const doc = new Front()
  return {
    ports: {
      link: {
        getSnapshot: () => current,
        subscribe: (l) => {
          linkListeners.add(l)
          return () => linkListeners.delete(l)
        },
        onMissing: (l) => {
          missingListeners.add(l)
          return () => missingListeners.delete(l)
        },
      },
      doc,
    },
    set(next): void {
      current = next
      for (const l of linkListeners) l()
    },
    front(visible): void {
      visibility = visible ? "visible" : "hidden"
      doc.dispatchEvent(new Event("visibilitychange"))
    },
    missing(): void {
      for (const l of missingListeners) l()
    },
  }
}

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

describe("when the phone asks", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("asks at start, back in front and on a not-found, and never on a timer", async () => {
    let now = 0
    const read = vi.fn(() =>
      Promise.resolve(answer({ supported: false, deploy: "wanted" }))
    )
    const serves = createServes({ read, now: () => now })
    const w = world(PAIRED)
    const stop = watchServes(serves, w.ports)
    await settle()
    expect(read).toHaveBeenCalledTimes(1)
    expect(serves.getSnapshot().serves).toBe("updating")

    w.front(false)
    await settle()
    expect(read).toHaveBeenCalledTimes(1)
    w.front(true)
    await settle()
    expect(read).toHaveBeenCalledTimes(2)

    now = 10
    w.missing()
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    now = MISSING_GAP + 10
    w.missing()
    await settle()
    expect(read).toHaveBeenCalledTimes(3)

    vi.useFakeTimers()
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(read).toHaveBeenCalledTimes(3)
    stop()
  })

  it("asks nothing unpaired, asks once paired, and forgets on an unpairing", async () => {
    const read = vi.fn(() => Promise.resolve(answer({ supported: true })))
    const serves = createServes({ read, now: () => 0 })
    const w = world(UNPAIRED)
    const stop = watchServes(serves, w.ports)
    w.front(true)
    await settle()
    expect(read).not.toHaveBeenCalled()
    w.set(PAIRED)
    await settle()
    expect(serves.getSnapshot().serves).toBe("fits")
    w.set(UNPAIRED)
    expect(serves.getSnapshot()).toBe(INITIAL_SERVES)
    stop()
  })

  it("asks once more when the link frees after turning an ask away", async () => {
    const read = vi
      .fn<() => Promise<CompatAsked>>()
      .mockResolvedValueOnce({ kind: "busy" })
      .mockResolvedValue(answer({ supported: false, deploy: "unavailable" }))
    const serves = createServes({ read, now: () => 0 })
    const w = world({
      ...PAIRED,
      activity: { kind: "keeping", stopping: false },
    })
    const stop = watchServes(serves, w.ports)
    await settle()
    expect(read).toHaveBeenCalledTimes(1)
    w.set(PAIRED)
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    expect(serves.getSnapshot().serves).toBe("not-yet")
    // Freed again with nothing owed: no ask.
    w.set({ ...PAIRED, activity: { kind: "keeping", stopping: false } })
    w.set(PAIRED)
    await settle()
    expect(read).toHaveBeenCalledTimes(2)
    stop()
  })

  it("drops an answer that lands after the phone was unpaired", async () => {
    let land: (asked: CompatAsked) => void = () => undefined
    const serves = createServes({
      read: () =>
        new Promise((resolve) => {
          land = resolve
        }),
      now: () => 0,
    })
    const out = serves.ask("start")
    serves.forget()
    land(answer({ supported: false, deploy: "client_behind" }))
    expect(await out).toBeNull()
    expect(serves.getSnapshot()).toBe(INITIAL_SERVES)
  })

  it("asks on a pull, and the pull never fails on it", async () => {
    const read = vi
      .fn<() => Promise<CompatAsked>>()
      .mockResolvedValue({ kind: "unreachable" })
    const refresher = servesRefresher(createServes({ read, now: () => 0 }))
    await expect(refresher.checkAgain()).resolves.toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it("asks again at the link's next change after the link turned a pull's ask away", async () => {
    const read = vi
      .fn<() => Promise<CompatAsked>>()
      .mockResolvedValueOnce({ kind: "unreachable" })
      .mockResolvedValueOnce({ kind: "busy" })
      .mockResolvedValue(answer({ supported: true }))
    const serves = createServes({ read, now: () => 0 })
    const w = world(PAIRED)
    const stop = watchServes(serves, w.ports)
    await settle()
    await servesRefresher(serves).checkAgain()
    expect(serves.owes()).toBe(true)
    w.set({ ...PAIRED })
    await settle()
    expect(read).toHaveBeenCalledTimes(3)
    expect(serves.getSnapshot().serves).toBe("fits")
    expect(serves.owes()).toBe(false)
    stop()
  })
})
