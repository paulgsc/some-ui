import type { KeptBite } from "@game-week/lib/bite"
import { fixtureFeed } from "@game-week/lib/feed"
import { ASK_HOLD_MS, phaseOf } from "@game-week/lib/machine"
import type { BiteStore } from "@game-week/lib/ports"
import { INITIAL_PREFS, parsePrefs, storedPrefs } from "@game-week/lib/ports"
import type { GameWeekPorts } from "@game-week/lib/runtime"
import { createGameWeek } from "@game-week/lib/runtime"
import { NOTICES } from "@game-week/lib/words"
import { microphoneOwner } from "@some-ui/voice-capture"
import {
  simulatedMicrophone,
  simulatedPlayer,
  SPEAKING,
} from "@some-ui/voice-capture/testing"
import { afterEach, describe, expect, it, vi } from "vitest"

import { T0 } from "./fixture"

type MemoryStore = BiteStore & {
  kept: Map<string, KeptBite>
  /** Bites a keep refused, as the store holds them to try again. */
  held: Map<string, KeptBite>
  failKeep: boolean
  /** What `amend` answers for a bite it knows. */
  amendAs: "noted" | "on-its-way"
  /** A later try keeps every held bite, and the listeners hear of it. */
  retry: () => void
}

function memoryStore(failKeep = false): MemoryStore {
  const listeners = new Set<() => void>()
  const store: MemoryStore = {
    kept: new Map(),
    held: new Map(),
    failKeep,
    amendAs: "noted",
    retry(): void {
      for (const [id, bite] of store.held) store.kept.set(id, bite)
      store.held.clear()
      for (const listener of listeners) listener()
    },
    keep: (bite): Promise<void> => {
      if (store.failKeep) {
        store.held.set(bite.id, bite)
        return Promise.reject(new Error("full"))
      }
      store.kept.set(bite.id, bite)
      return Promise.resolve()
    },
    amend: (id, fields, holdUntil): Promise<"noted" | "on-its-way"> => {
      const bite = store.kept.get(id)
      if (bite === undefined) return Promise.reject(new Error("gone"))
      if (store.amendAs === "noted")
        store.kept.set(id, { ...bite, fields, holdUntil })
      return Promise.resolve(store.amendAs)
    },
    release: () => Promise.resolve(),
    undo: (id): Promise<void> => {
      store.kept.delete(id)
      store.held.delete(id)
      return Promise.resolve()
    },
    audio: (id) =>
      Promise.resolve(store.kept.has(id) ? new Blob(["said"]) : null),
    isKept: (id) => store.kept.has(id),
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
  return store
}

/** The page's clock and visibility, which a test moves. */
type Page = { now: number; show: () => void }

function ports(
  store: BiteStore,
  level = 0.5,
  page: Page = { now: T0, show: () => undefined }
): GameWeekPorts {
  return {
    // The shared simulated microphone, hearing three seconds at `level`.
    startRecording: simulatedMicrophone({
      now: () => page.now,
      fallback: { ...SPEAKING, level, durationMs: 3_000 },
    }).startRecording,
    owner: microphoneOwner(),
    player: simulatedPlayer(),
    store,
    feed: fixtureFeed(() => T0),
    prefs: storedPrefs(null),
    now: () => page.now,
    newId: () => "bite-1",
    onVisibility: (listener) => {
      page.show = (): void => listener(false)
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
    expect(phaseOf(runtime.getSnapshot())).toBe("recording")
    detach()
    await vi.advanceTimersByTimeAsync(0)
    expect([...store.kept.keys()]).toEqual(["bite-1"])
    expect(store.kept.get("bite-1")?.fields).toMatchObject({
      how: "offered",
      scenario: "in.sack",
      seq: "41",
    })
  })

  it("leaves a bite the store refused to the store, and says so", async () => {
    vi.useFakeTimers()
    const runtime = createGameWeek(ports(memoryStore(true)))
    const detach = runtime.attach()
    runtime.dispatch({ type: "say", said: { how: "said-first" } })
    await vi.advanceTimersByTimeAsync(0)
    runtime.dispatch({ type: "done" })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getSnapshot().keeping).toMatchObject([
      { id: "bite-1", held: true },
    ])
    expect(runtime.getSnapshot().undo).toEqual({ id: "bite-1", until: null })
    expect(runtime.getSnapshot().notice).toBe(NOTICES.notKept)
    detach()
  })

  it("offers Undo on a bite the store holds, and hears when a later try keeps it", async () => {
    vi.useFakeTimers()
    const store = memoryStore(true)
    const runtime = createGameWeek(ports(store))
    const detach = runtime.attach()
    runtime.dispatch({
      type: "say",
      said: { how: "offered", scenario: "in.sack", context: "Pressure" },
    })
    await vi.advanceTimersByTimeAsync(0)
    runtime.dispatch({ type: "done" })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getSnapshot().undo?.id).toBe("bite-1")
    expect(runtime.getSnapshot().notice).toBe(NOTICES.notKept)

    store.retry()
    expect(runtime.getSnapshot().keeping).toEqual([])
    expect(runtime.getSnapshot().notice).toBe(NOTICES.keptNow)
    // Still inside the hold: Undo throws the now-kept bite away.
    runtime.dispatch({ type: "undo" })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.kept.size).toBe(0)
    detach()
  })

  it("Undo throws away a bite the store still holds", async () => {
    vi.useFakeTimers()
    const store = memoryStore(true)
    const runtime = createGameWeek(ports(store))
    const detach = runtime.attach()
    runtime.dispatch({
      type: "say",
      said: { how: "offered", scenario: "in.sack", context: "Pressure" },
    })
    await vi.advanceTimersByTimeAsync(0)
    runtime.dispatch({ type: "done" })
    await vi.advanceTimersByTimeAsync(0)
    runtime.dispatch({ type: "undo" })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.held.size).toBe(0)
    expect(runtime.getSnapshot().keeping).toEqual([])
    expect(runtime.getSnapshot().notice).toBe(NOTICES.thrownAway)
    detach()
  })

  it("closes a question past its bite's hold when the page comes back", async () => {
    vi.useFakeTimers()
    const page: Page = { now: T0, show: () => undefined }
    const runtime = createGameWeek(ports(memoryStore(), 0.5, page))
    const detach = runtime.attach()
    runtime.dispatch({ type: "say", said: { how: "said-first" } })
    await vi.advanceTimersByTimeAsync(0)
    runtime.dispatch({ type: "done" })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getSnapshot().activity.kind).toBe("asking")
    page.now += ASK_HOLD_MS
    page.show()
    expect(runtime.getSnapshot().activity.kind).toBe("idle")
    expect(runtime.getSnapshot().undo).toBeNull()
    expect(runtime.getSnapshot().notice).toBe(NOTICES.askClosed)
    detach()
  })

  it("says so when an answer arrives after its bite went on its way", async () => {
    vi.useFakeTimers()
    const store = memoryStore()
    const runtime = createGameWeek(ports(store))
    const detach = runtime.attach()
    runtime.dispatch({ type: "say", said: { how: "said-first" } })
    await vi.advanceTimersByTimeAsync(0)
    runtime.dispatch({ type: "done" })
    await vi.advanceTimersByTimeAsync(0)
    store.amendAs = "on-its-way"
    runtime.dispatch({
      type: "answer",
      said: { how: "offered", scenario: "in.sack", context: "Pressure" },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(runtime.getSnapshot().notice).toBe(NOTICES.tooLateToNote)
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
