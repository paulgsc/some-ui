import { IncidentPlayRuntime } from "@leetype/lib/leetype/incident-play"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import { SessionFileSchema } from "@leetype/types/session-file"
import type { KeyedStorage } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it, vi } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)

function runtimeOver(storage: KeyedStorage | null): {
  runtime: IncidentPlayRuntime
  tick: (ms: number) => void
} {
  let now = Date.parse("2026-10-18T20:00:00.000Z")
  let id = 0
  const runtime = new IncidentPlayRuntime({
    log: createSessionLogStore(storage),
    now: (): number => now,
    newId: (): string => `id${String(++id)}`,
  })
  return {
    runtime,
    tick: (ms): void => {
      now += ms
    },
  }
}

describe("IncidentPlayRuntime", () => {
  it("times a pick by its own clock and keeps every step in the log", () => {
    const storage = memoryStorage()
    const { runtime, tick } = runtimeOver(storage)
    runtime.start({ fileName: "t1-01", file: FILE, form: "full" })
    runtime.dispatch({ type: "act", action: 0 })
    tick(4200)
    runtime.dispatch({ type: "pick", option: 1 })

    const reopened = createSessionLogStore(storage).getSnapshot().log
    expect(reopened.map((event) => event.type)).toEqual(["started", "picked"])
    expect(reopened[1]).toMatchObject({ ms: 4200, screen: "s02" })
    expect(runtime.getSnapshot()).toMatchObject({
      play: { screen: "s02", reveal: { struggled: true } },
      problem: null,
    })
  })

  it("plays on when the log refuses a step, and says what was not kept", () => {
    const { runtime } = runtimeOver(null)
    runtime.start({ fileName: "t1-01", file: FILE, form: "full" })
    expect(runtime.getSnapshot().play?.screen).toBe("s01")
    expect(runtime.getSnapshot().problem).toMatch(/can't read its session log/)
  })

  it("offers the end once the declared length runs, cut to the host's time", () => {
    const fire: Array<() => void> = []
    const cancel = vi.fn()
    const after = vi.fn((_ms: number, fired: () => void) => {
      fire.push(fired)
      return cancel
    })
    const log = createSessionLogStore(memoryStorage())
    const runtime = new IncidentPlayRuntime({
      log,
      now: (): number => 0,
      newId: (): string => crypto.randomUUID(),
      after,
    })
    const detach = runtime.attach()
    runtime.start({
      fileName: "t1-01",
      file: FILE,
      form: "full",
      limitMinutes: 3,
    })
    expect(after).toHaveBeenCalledWith(180_000, expect.any(Function))
    expect(log.getSnapshot().log[0]).toMatchObject({ declaredMinutes: 3 })
    expect(runtime.getSnapshot().timeUp).toBe(false)

    fire[0]?.()
    // Offered, never forced: the session goes on.
    expect(runtime.getSnapshot()).toMatchObject({
      timeUp: true,
      play: { screen: "s01", ended: null },
    })
    detach()
    expect(cancel).toHaveBeenCalled()
  })

  it("keeps the timer to a host's limit under a minute", () => {
    const after = vi.fn(
      (_ms: number, _fired: () => void) => (): void => undefined
    )
    const runtime = new IncidentPlayRuntime({
      log: createSessionLogStore(memoryStorage()),
      now: (): number => 0,
      newId: (): string => crypto.randomUUID(),
      after,
    })
    runtime.attach()
    runtime.start({
      fileName: "t1-01",
      file: FILE,
      form: "full",
      limitMinutes: 1 / 3,
    })
    expect(after).toHaveBeenCalledWith(20_000, expect.any(Function))
  })

  it("leaves the time the app spends in the background out of a pick's time", () => {
    let now = 0
    let hidden = false
    const listeners = new Set<() => void>()
    const log = createSessionLogStore(memoryStorage())
    const runtime = new IncidentPlayRuntime({
      log,
      now: (): number => now,
      newId: (): string => crypto.randomUUID(),
      after: () => (): void => undefined,
      visibility: {
        hidden: (): boolean => hidden,
        subscribe: (listener): (() => void) => {
          listeners.add(listener)
          return (): void => void listeners.delete(listener)
        },
      },
    })
    const toggle = (to: boolean): void => {
      hidden = to
      for (const listener of listeners) listener()
    }
    const detach = runtime.attach()
    runtime.start({ fileName: "t1-01", file: FILE, form: "full" })
    runtime.dispatch({ type: "act", action: 0 })
    now += 2000
    toggle(true)
    now += 60_000
    toggle(false)
    now += 1000
    runtime.dispatch({ type: "pick", option: 1 })
    expect(log.getSnapshot().log.at(-1)).toMatchObject({
      type: "picked",
      ms: 3000,
    })
    detach()
    expect(listeners.size).toBe(0)
  })

  it("runs on to the same deadline when the surface mounts twice", () => {
    let now = 0
    const after = vi.fn(
      (_ms: number, _fired: () => void) => (): void => undefined
    )
    const runtime = new IncidentPlayRuntime({
      log: createSessionLogStore(memoryStorage()),
      now: (): number => now,
      newId: (): string => crypto.randomUUID(),
      after,
    })
    const detach = runtime.attach()
    runtime.start({ fileName: "t1-01", file: FILE, form: "short" })
    expect(after).toHaveBeenLastCalledWith(300_000, expect.any(Function))
    detach()
    now += 60_000
    runtime.attach()
    expect(after).toHaveBeenLastCalledWith(240_000, expect.any(Function))
  })
})
