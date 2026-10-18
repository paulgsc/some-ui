import { IncidentPlayRuntime } from "@leetype/lib/leetype/incident-play"
import { AB_FIXTURES } from "@leetype/lib/leetype/session-file/__tests__/fixtures"
import { createSessionLogStore } from "@leetype/lib/leetype/session-log"
import { SessionFileSchema } from "@leetype/types/session-file"
import type { KeyedStorage } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

const FILE = SessionFileSchema.parse(AB_FIXTURES[1]?.raw)

function runtimeOver(storage: KeyedStorage | null): {
  runtime: IncidentPlayRuntime
  tick: (ms: number) => void
} {
  let now = Date.parse("2026-10-18T20:00:00.000Z")
  let id = 0
  const runtime = new IncidentPlayRuntime({
    log: createSessionLogStore(storage),
    now: () => now,
    newId: () => `id${String(++id)}`,
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
})
