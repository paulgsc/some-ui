import type { KeptBite } from "@game-week/lib/bite"
import { fixtureFeed } from "@game-week/lib/feed"
import type { BiteStore } from "@game-week/lib/ports"
import { INITIAL_PREFS, parsePrefs, storedPrefs } from "@game-week/lib/ports"
import type { GameWeekPorts } from "@game-week/lib/runtime"
import { createGameWeek } from "@game-week/lib/runtime"
import { afterEach, describe, expect, it, vi } from "vitest"

import { T0 } from "./fixture"

function memoryStore(
  failKeep = false
): BiteStore & { kept: Map<string, KeptBite> } {
  const kept = new Map<string, KeptBite>()
  return {
    kept,
    keep: (bite): Promise<void> => {
      if (failKeep) return Promise.reject(new Error("full"))
      kept.set(bite.id, bite)
      return Promise.resolve()
    },
    amend: (id, fields, holdUntil): Promise<void> => {
      const bite = kept.get(id)
      if (bite === undefined) return Promise.reject(new Error("gone"))
      kept.set(id, { ...bite, fields, holdUntil })
      return Promise.resolve()
    },
    release: () => Promise.resolve(),
    undo: (id): Promise<void> => {
      kept.delete(id)
      return Promise.resolve()
    },
  }
}

function ports(store: BiteStore, level = 0.5): GameWeekPorts {
  let now = T0
  return {
    startRecording: () =>
      Promise.resolve({
        level: () => level,
        finish: () =>
          Promise.resolve({
            blob: new Blob(["said"], { type: "audio/webm" }),
            mimeType: "audio/webm",
            durationMs: ((now = now + 3_000), 3_000),
          }),
        discard: () => undefined,
      }),
    store,
    feed: fixtureFeed(() => T0),
    prefs: storedPrefs(null),
    now: () => now,
    newId: () => "bite-1",
    onVisibility: (listener) => {
      listener(false)
      return () => undefined
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("createGameWeek", () => {
  it("keeps a bite cut short by leaving the page", async () => {
    vi.useFakeTimers()
    const store = memoryStore()
    const runtime = createGameWeek(ports(store))
    const detach = runtime.attach()
    runtime.dispatch({
      type: "say",
      said: { how: "offered", scenario: "in.sack", context: "Pressure" },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getSnapshot().activity.kind).toBe("recording")
    detach()
    await vi.advanceTimersByTimeAsync(0)
    expect([...store.kept.keys()]).toEqual(["bite-1"])
    expect(store.kept.get("bite-1")?.fields).toMatchObject({
      how: "offered",
      scenario: "in.sack",
      seq: "41",
    })
  })

  it("holds a bite the store refused, for keeping again", async () => {
    vi.useFakeTimers()
    const runtime = createGameWeek(ports(memoryStore(true)))
    const detach = runtime.attach()
    runtime.dispatch({ type: "say", said: { how: "said-first" } })
    await vi.advanceTimersByTimeAsync(0)
    runtime.dispatch({ type: "done" })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getSnapshot().stranded.map((s) => s.bite.id)).toEqual([
      "bite-1",
    ])
    detach()
  })
})

describe("storedPrefs", () => {
  it("reads back what it saved, and starts in Standard", () => {
    const map = new Map<string, string>()
    const storage = {
      getItem: (key: string): string | null => map.get(key) ?? null,
      setItem: (key: string, value: string): void => void map.set(key, value),
      removeItem: (key: string): void => void map.delete(key),
    }
    const prefs = storedPrefs(storage)
    expect(prefs.read()).toEqual(INITIAL_PREFS)
    prefs.save({ mode: "full", gameId: "1", notWatching: ["2"] })
    expect(storedPrefs(storage).read()).toEqual({
      mode: "full",
      gameId: "1",
      notWatching: ["2"],
    })
    expect(parsePrefs('{"mode":"loud"}')).toBeNull()
  })
})
