import type { Presented, VoicePort, VoiceRequest } from "@some-ui/makjang"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { createPastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import { DramaRuntime } from "@topik/lib/topik/core/drama-runtime"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it } from "vitest"

const lesson = workedLesson()

/** A voice whose lines end only when the test says so, and can be muted. */
function heldVoice(): VoicePort & {
  requests: Array<{ request: VoiceRequest; signal: AbortSignal }>
  finish: (index: number, outcome?: Presented) => Promise<void>
  mute: (muted: boolean) => void
} {
  const requests: Array<{ request: VoiceRequest; signal: AbortSignal }> = []
  const ends: Array<(outcome: Presented) => void> = []
  const listeners = new Set<() => void>()
  let muted = false
  return {
    requests,
    voice: (request, signal): Promise<Presented> => {
      requests.push({ request, signal })
      return new Promise((resolve) => ends.push(resolve))
    },
    audible: (): boolean => !muted,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    finish: async (index, outcome = "presented"): Promise<void> => {
      ends[index]?.(outcome)
      await Promise.resolve()
      await Promise.resolve()
    },
    mute: (next): void => {
      muted = next
      for (const listener of listeners) listener()
    },
  }
}

const slot = (): ReturnType<typeof createPastedLessonStore> => {
  const store = createPastedLessonStore(memoryStorage())
  store.setTree(lesson)
  return store
}

describe("DramaRuntime", () => {
  it("voices nothing until the learner touches the lesson", () => {
    const voice = heldVoice()
    const runtime = new DramaRuntime(lesson, { voice, points: slot().points })
    runtime.connect()
    expect(voice.requests).toHaveLength(0)
    runtime.dispatch({ type: "advance" })
    expect(voice.requests.map(({ request }) => request.beat)).toEqual(["s1-l1"])
    expect(voice.requests[0]?.request).toMatchObject({
      speaker: "chairman",
      text: "앉아. 차 마실래?",
      interrupt: false,
    })
  })

  it("aborts the line in flight for a newer one, and ignores its late end", async () => {
    const voice = heldVoice()
    const runtime = new DramaRuntime(lesson, { voice, points: slot().points })
    runtime.dispatch({ type: "advance" })
    voice.requests[0]?.request.onStart?.()
    expect(runtime.getSnapshot().speaking).toBe("s1-l1")

    runtime.replay("s1-n1")
    expect(voice.requests[0]?.signal.aborted).toBe(true)
    expect(voice.requests[1]?.request).toMatchObject({
      beat: "s1-n1",
      interrupt: true,
    })
    voice.requests[1]?.request.onStart?.()
    // The aborted line resolving late does not clear the newer one.
    await voice.finish(0, "cancelled")
    expect(runtime.getSnapshot().speaking).toBe("s1-n1")
    await voice.finish(1)
    expect(runtime.getSnapshot().speaking).toBeNull()
  })

  it("keeps the engine's resume point beside its tree, and resumes from it", () => {
    const store = slot()
    const points = store.points
    const runtime = new DramaRuntime(lesson, { voice: null, points })
    runtime.dispatch({ type: "advance" })
    runtime.dispatch({ type: "advance" })
    runtime.dispatch({ type: "choose", option: "b" })

    const again = new DramaRuntime(lesson, { voice: null, points })
    expect(again.getSnapshot().session.drama).toEqual(
      runtime.getSnapshot().session.drama
    )
    // A newly pasted tree, the same one included, starts from its opening.
    store.setTree(lesson)
    const fresh = new DramaRuntime(lesson, { voice: null, points })
    expect(fresh.getSnapshot().session.drama.route).toEqual([])
  })

  it("starts the ladder at Hangul while muted, and says the owed line on unmute", async () => {
    const voice = heldVoice()
    voice.mute(true)
    const runtime = new DramaRuntime(lesson, { voice, points: slot().points })
    runtime.connect()
    expect(runtime.getSnapshot().session.audio).toBe(false)

    runtime.dispatch({ type: "advance" })
    await voice.finish(0, "unavailable")
    voice.mute(false)
    expect(runtime.getSnapshot().session).toMatchObject({
      audio: true,
      // What was read while muted stays read.
      rungs: { "s1-n1": 1, "s1-l1": 1 },
    })
    expect(voice.requests.map(({ request }) => request.beat)).toEqual([
      "s1-l1",
      "s1-l1",
    ])
  })

  it("stops the line when disconnected, and follows the voice no more", () => {
    const voice = heldVoice()
    const runtime = new DramaRuntime(lesson, { voice, points: slot().points })
    const disconnect = runtime.connect()
    runtime.dispatch({ type: "advance" })
    disconnect()
    expect(voice.requests[0]?.signal.aborted).toBe(true)
    voice.mute(true)
    expect(runtime.getSnapshot().session.audio).toBe(true)
  })
})
