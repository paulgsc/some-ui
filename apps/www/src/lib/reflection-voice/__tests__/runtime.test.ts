import { ShelfFullError } from "@some-ui/voice-capture"
import { memoryShelf } from "@some-ui/voice-capture/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { testReflections } from "@/lib/reflection-voice/__tests__/takes"
import type { ReflectionTakes } from "@/lib/reflection-voice/runtime"
import { REFLECTION_REFUSED } from "@/lib/reflection-voice/words"

const pass = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

/** One take of `ms`, `atMs` into the session, tapped on and off. */
async function talk(
  voice: ReflectionTakes,
  atMs: number | null,
  supersedes: string | null = null,
  ms = 4_000
): Promise<void> {
  voice.tap(atMs, supersedes)
  await pass(ms)
  voice.tap(atMs)
  await pass()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createVoiceNote", () => {
  it("keeps the reflection with its session and the moment it was started, then its audio", async () => {
    const phone = testReflections("s1")
    await talk(phone.voice, 90_000)
    expect(phone.kept()).toEqual([
      {
        id: "v1",
        sessionId: "s1",
        createdAt: expect.any(String),
        atMs: 90_000,
        body: {
          kind: "voice",
          durationMs: 4_000,
          mimeType: expect.any(String),
          bytes: expect.any(Number),
        },
      },
    ])
    expect(await phone.audio.ids()).toEqual(["v1"])
    expect(phone.voice.pattern.getSnapshot().ended?.ending).toBe("kept")
    expect(phone.voice.getSnapshot()).toMatchObject([
      {
        id: "v1",
        answers: "s1",
        standing: "current",
        kept: { place: "phone" },
      },
    ])
  })

  it("keeps the take a Redo records again, out of view, and sets one aside, kept (D2, D3)", async () => {
    const phone = testReflections("s1")
    await talk(phone.voice, 1_000)
    await talk(phone.voice, 2_000, "v1")
    phone.voice.pattern.letGo("v2", "phone")
    expect(
      phone
        .kept()
        .map((r) => [r.id, r.body.kind === "voice" && r.body.standing])
    ).toEqual([
      ["v2", "set-aside"],
      ["v1", "earlier"],
    ])
    expect(await phone.audio.ids()).toEqual(["v1", "v2"])
  })

  it("lists only its own session's spoken reflections, saying where each is kept", async () => {
    const phone = testReflections("s1")
    await talk(phone.voice, null)
    phone.where(() => ({ place: "home", since: null }))
    expect(phone.voice.getSnapshot()).toMatchObject([
      { id: "v1", kept: { place: "home" } },
    ])
  })

  it("stores no audio when the reflection could not be kept", async () => {
    const phone = testReflections("s1", { stores: () => "failed" })
    await talk(phone.voice, null)
    expect(await phone.audio.ids()).toEqual([])
    expect(phone.voice.pattern.getSnapshot().ended?.ending).toBe("failed")
  })

  it("takes the reflection back out when its audio cannot be kept, and supersedes nothing", async () => {
    const audio = memoryShelf()
    const phone = testReflections("s1", { audio })
    await talk(phone.voice, null)
    audio.put = (): Promise<never> => Promise.reject(new ShelfFullError())
    await talk(phone.voice, null, "v1")
    expect(phone.kept().map((r) => r.id)).toEqual(["v1"])
    expect(phone.voice.getSnapshot()).toMatchObject([{ standing: "current" }])
    expect(phone.voice.pattern.getSnapshot().ended?.ending).toBe("full")
  })

  it("says so when the phone won't store a take set aside or recorded again, and keeps it the session's", async () => {
    const phone = testReflections("s1", { standsAside: () => false })
    await talk(phone.voice, null)
    phone.voice.pattern.letGo("v1", "phone")
    expect(phone.voice.refused()).toBe(REFLECTION_REFUSED.setAside)
    expect(phone.voice.getSnapshot()).toMatchObject([{ standing: "current" }])
    await talk(phone.voice, null, "v1")
    expect(phone.voice.refused()).toBe(REFLECTION_REFUSED.supersede)
    expect(phone.voice.getSnapshot().map(({ standing }) => standing)).toEqual([
      "current",
      "current",
    ])
    // The next tap clears it.
    phone.voice.tap(null)
    expect(phone.voice.refused()).toBeNull()
  })
})
