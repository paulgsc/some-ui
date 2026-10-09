import type {
  Presented,
  SoundPort,
  StingRequest,
  VoicePort,
  VoiceRequest,
} from "@some-ui/makjang"
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

/** A sound whose stings end only when the test says so, off until turned on. */
function heldSound(on = true): SoundPort & {
  stings: Array<{ request: StingRequest; signal: AbortSignal }>
  finish: (index: number) => Promise<void>
  turn: (on: boolean) => void
} {
  const stings: Array<{ request: StingRequest; signal: AbortSignal }> = []
  const ends: Array<(outcome: Presented) => void> = []
  const listeners = new Set<() => void>()
  return {
    stings,
    sting: (request, signal): Promise<Presented> => {
      stings.push({ request, signal })
      return new Promise((resolve) => {
        ends.push(resolve)
        signal.addEventListener("abort", () => resolve("cancelled"))
      })
    },
    audible: (): boolean => on,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    finish: async (index): Promise<void> => {
      ends[index]?.("presented")
      for (let tick = 0; tick < 4; tick += 1) await Promise.resolve()
    },
    turn: (next): void => {
      on = next
      for (const listener of listeners) listener()
    },
  }
}

const beats = (voice: ReturnType<typeof heldVoice>): Array<string> =>
  voice.requests.map(({ request }) => request.beat)

const slot = (): ReturnType<typeof createPastedLessonStore> => {
  const store = createPastedLessonStore(memoryStorage())
  store.setTree(lesson)
  return store
}

describe("DramaRuntime", () => {
  it("voices nothing until the learner touches the lesson", () => {
    const voice = heldVoice()
    const runtime = new DramaRuntime(lesson, {
      voice,
      sound: null,
      points: slot().points,
    })
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
    const runtime = new DramaRuntime(lesson, {
      voice,
      sound: null,
      points: slot().points,
    })
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
    const runtime = new DramaRuntime(lesson, {
      voice: null,
      sound: null,
      points,
    })
    runtime.dispatch({ type: "advance" })
    runtime.dispatch({ type: "advance" })
    runtime.dispatch({ type: "choose", option: "b" })

    const again = new DramaRuntime(lesson, { voice: null, sound: null, points })
    expect(again.getSnapshot().session.drama).toEqual(
      runtime.getSnapshot().session.drama
    )
    // A newly pasted tree, the same one included, starts from its opening.
    store.setTree(lesson)
    const fresh = new DramaRuntime(lesson, { voice: null, sound: null, points })
    expect(fresh.getSnapshot().session.drama.route).toEqual([])
  })

  it("starts the ladder at Hangul while muted, and says the owed line on unmute", async () => {
    const voice = heldVoice()
    voice.mute(true)
    const runtime = new DramaRuntime(lesson, {
      voice,
      sound: null,
      points: slot().points,
    })
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

  it("does not say a failed line again on its own", async () => {
    const voice = heldVoice()
    const runtime = new DramaRuntime(lesson, {
      voice,
      sound: null,
      points: slot().points,
    })
    runtime.connect()
    runtime.dispatch({ type: "advance" })
    await voice.finish(0, "unavailable")
    // A later notice (a voice list changing) is not sound returning.
    voice.mute(false)
    expect(voice.requests).toHaveLength(1)
  })

  it("stops the line when disconnected, and follows the voice no more", () => {
    const voice = heldVoice()
    const runtime = new DramaRuntime(lesson, {
      voice,
      sound: null,
      points: slot().points,
    })
    const disconnect = runtime.connect()
    runtime.dispatch({ type: "advance" })
    disconnect()
    expect(voice.requests[0]?.signal.aborted).toBe(true)
    voice.mute(true)
    expect(runtime.getSnapshot().session.audio).toBe(true)
  })

  describe("the scene's sting", () => {
    it("plays nothing with sound off", () => {
      const voice = heldVoice()
      const sound = heldSound(false)
      const runtime = new DramaRuntime(lesson, {
        voice,
        sound,
        points: slot().points,
      })
      runtime.connect()
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "choose", option: "b" })
      expect(sound.stings).toHaveLength(0)
      expect(beats(voice)).toEqual(["s1-l1", "s3-l1"])
    })

    it("plays once per scene entry, before the line, which waits for it", async () => {
      const voice = heldVoice()
      const sound = heldSound()
      const runtime = new DramaRuntime(lesson, {
        voice,
        sound,
        points: slot().points,
      })
      runtime.connect()
      // Nothing plays before the first touch; the opening's sting is owed.
      expect(sound.stings).toHaveLength(0)
      runtime.dispatch({ type: "advance" })
      expect(sound.stings.map(({ request }) => request)).toEqual([
        { scene: "s1", feeling: "tension" },
      ])
      expect(beats(voice)).toEqual([])
      await sound.finish(0)
      expect(beats(voice)).toEqual(["s1-l1"])

      // The rest of the scene plays no second sting.
      runtime.dispatch({ type: "back" })
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      expect(sound.stings).toHaveLength(1)

      runtime.dispatch({ type: "choose", option: "b" })
      expect(sound.stings[1]?.request).toEqual({
        scene: "s3",
        feeling: "chill",
      })
      expect(beats(voice)).toEqual(["s1-l1", "s1-n1", "s1-l1"])
      await sound.finish(1)
      expect(beats(voice).at(-1)).toBe("s3-l1")
    })

    it("plays at once when sound is turned on, unless a line is playing", async () => {
      const voice = heldVoice()
      const sound = heldSound(false)
      const runtime = new DramaRuntime(lesson, {
        voice,
        sound,
        points: slot().points,
      })
      runtime.connect()
      sound.turn(true)
      expect(sound.stings.map(({ request }) => request.scene)).toEqual(["s1"])
      await sound.finish(0)
      sound.turn(false)
      sound.turn(true)
      expect(sound.stings).toHaveLength(1)

      // A line playing keeps the next scene's sting for its next line.
      sound.turn(false)
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "choose", option: "b" })
      sound.turn(true)
      expect(sound.stings).toHaveLength(1)
      runtime.dispatch({ type: "advance" })
      expect(sound.stings[1]?.request.scene).toBe("s3")
      expect(beats(voice).at(-1)).toBe("s3-l1")
    })

    it("is cut off by a replay, by sound turned off, and by leaving", () => {
      const voice = heldVoice()
      const sound = heldSound()
      const runtime = new DramaRuntime(lesson, {
        voice,
        sound,
        points: slot().points,
      })
      const disconnect = runtime.connect()
      runtime.dispatch({ type: "advance" })
      runtime.replay("s1-n1")
      expect(sound.stings[0]?.signal.aborted).toBe(true)
      expect(voice.requests[0]?.request).toMatchObject({
        beat: "s1-n1",
        interrupt: true,
      })

      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "choose", option: "b" })
      sound.turn(false)
      expect(sound.stings[1]?.signal.aborted).toBe(true)

      sound.turn(true)
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "choose", option: "y" })
      disconnect()
      expect(sound.stings[2]?.signal.aborted).toBe(true)
    })
  })
})
