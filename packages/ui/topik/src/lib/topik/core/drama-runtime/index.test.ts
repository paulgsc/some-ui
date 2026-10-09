import type {
  Presented,
  SoundPort,
  StingRequest,
  VoicePort,
  VoiceRequest,
} from "@some-ui/makjang"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { createLastDramaStore } from "@topik/lib/topik/adapter/last-drama-store"
import { createPastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import { DramaRuntime } from "@topik/lib/topik/core/drama-runtime"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it } from "vitest"

const lesson = workedLesson()

/**
 * A port whose requests end when the test says so, or, with `resolveOnAbort`,
 * when their signal fires, as a sting does.
 */
function held<Request>(
  audible: boolean,
  resolveOnAbort = false
): {
  requests: Array<{ request: Request; signal: AbortSignal }>
  play: (request: Request, signal: AbortSignal) => Promise<Presented>
  audible: () => boolean
  subscribe: (listener: () => void) => () => void
  finish: (index: number, outcome?: Presented) => Promise<void>
  /** Sets `audible` and notifies, as a mute or the sound toggle does. */
  turn: (audible: boolean) => void
} {
  const requests: Array<{ request: Request; signal: AbortSignal }> = []
  const ends: Array<(outcome: Presented) => void> = []
  const listeners = new Set<() => void>()
  return {
    requests,
    play: (request, signal): Promise<Presented> => {
      requests.push({ request, signal })
      return new Promise((resolve) => {
        ends.push(resolve)
        if (resolveOnAbort) {
          signal.addEventListener("abort", () => resolve("cancelled"))
        }
      })
    },
    audible: (): boolean => audible,
    subscribe: (listener): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    finish: async (index, outcome = "presented"): Promise<void> => {
      ends[index]?.(outcome)
      for (let tick = 0; tick < 4; tick += 1) await Promise.resolve()
    },
    turn: (next): void => {
      audible = next
      for (const listener of listeners) listener()
    },
  }
}

const heldVoice = (): ReturnType<typeof held<VoiceRequest>> & VoicePort => {
  const port = held<VoiceRequest>(true)
  return { ...port, voice: port.play }
}

const heldSound = (
  on = true
): ReturnType<typeof held<StingRequest>> & SoundPort => {
  const port = held<StingRequest>(on, true)
  return { ...port, sting: port.play }
}

const beats = (voice: ReturnType<typeof heldVoice>): Array<string> =>
  voice.requests.map(({ request }) => request.beat)

const slot = (): ReturnType<typeof createPastedLessonStore> => {
  const store = createPastedLessonStore(memoryStorage())
  store.setTree(lesson)
  return store
}

const runtimeOf = (
  ports: Partial<ConstructorParameters<typeof DramaRuntime>[1]>
): DramaRuntime =>
  new DramaRuntime(lesson, {
    voice: null,
    sound: null,
    points: slot().points,
    last: createLastDramaStore(memoryStorage()),
    ...ports,
  })

describe("DramaRuntime", () => {
  it("voices nothing until the learner touches the lesson", () => {
    const voice = heldVoice()
    const runtime = runtimeOf({ voice })
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
    const runtime = runtimeOf({ voice })
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
    const runtime = runtimeOf({ points })
    runtime.dispatch({ type: "advance" })
    runtime.dispatch({ type: "advance" })
    runtime.dispatch({ type: "choose", option: "b" })

    const again = runtimeOf({ points })
    expect(again.getSnapshot().session.drama).toEqual(
      runtime.getSnapshot().session.drama
    )
    // A newly pasted tree, the same one included, starts from its opening.
    store.setTree(lesson)
    const fresh = runtimeOf({ points })
    expect(fresh.getSnapshot().session.drama.route).toEqual([])
  })

  it("starts the ladder at Hangul while muted, and says the owed line on unmute", async () => {
    const voice = heldVoice()
    voice.turn(false)
    const runtime = runtimeOf({ voice })
    runtime.connect()
    expect(runtime.getSnapshot().session.audio).toBe(false)

    runtime.dispatch({ type: "advance" })
    await voice.finish(0, "unavailable")
    voice.turn(true)
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
    const runtime = runtimeOf({ voice })
    runtime.connect()
    runtime.dispatch({ type: "advance" })
    await voice.finish(0, "unavailable")
    // A later notice (a voice list changing) is not sound returning.
    voice.turn(true)
    expect(voice.requests).toHaveLength(1)
  })

  it("stops the line when disconnected, and follows the voice no more", () => {
    const voice = heldVoice()
    const runtime = runtimeOf({ voice })
    const disconnect = runtime.connect()
    runtime.dispatch({ type: "advance" })
    disconnect()
    expect(voice.requests[0]?.signal.aborted).toBe(true)
    voice.turn(false)
    expect(runtime.getSnapshot().session.audio).toBe(true)
  })

  describe("the scene's sting", () => {
    it("plays once per scene entry, before the line, which waits for it", async () => {
      const voice = heldVoice()
      const sound = heldSound()
      const runtime = runtimeOf({ voice, sound })
      runtime.connect()
      // Nothing plays before the first touch; the opening's sting is owed.
      expect(sound.requests).toHaveLength(0)
      runtime.dispatch({ type: "advance" })
      expect(sound.requests.map(({ request }) => request)).toEqual([
        { feeling: "tension" },
      ])
      expect(beats(voice)).toEqual([])
      await sound.finish(0)
      expect(beats(voice)).toEqual(["s1-l1"])

      // The rest of the scene plays no second sting.
      runtime.dispatch({ type: "back" })
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      expect(sound.requests).toHaveLength(1)

      runtime.dispatch({ type: "choose", option: "b" })
      expect(sound.requests[1]?.request).toEqual({ feeling: "chill" })
      expect(beats(voice)).toEqual(["s1-l1", "s1-n1", "s1-l1"])
      await sound.finish(1)
      expect(beats(voice).at(-1)).toBe("s3-l1")
    })

    it("plays at once when sound is turned on, unless a line is playing", async () => {
      const voice = heldVoice()
      const sound = heldSound(false)
      const runtime = runtimeOf({ voice, sound })
      runtime.connect()
      sound.turn(true)
      expect(sound.requests.map(({ request }) => request.feeling)).toEqual([
        "tension",
      ])
      await sound.finish(0)
      sound.turn(false)
      sound.turn(true)
      expect(sound.requests).toHaveLength(1)

      // A line playing keeps the next scene's sting for its next line.
      sound.turn(false)
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "choose", option: "b" })
      sound.turn(true)
      expect(sound.requests).toHaveLength(1)
      runtime.dispatch({ type: "advance" })
      expect(sound.requests[1]?.request.feeling).toBe("chill")
      expect(beats(voice).at(-1)).toBe("s3-l1")
    })

    it("plays once the line that was playing when sound was turned on ends", async () => {
      const voice = heldVoice()
      const sound = heldSound(false)
      const runtime = runtimeOf({ voice, sound })
      runtime.connect()
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      // s1-l1, the scene's last line, is still playing at its choice.
      sound.turn(true)
      expect(sound.requests).toHaveLength(0)
      await voice.finish(0)
      expect(sound.requests.map(({ request }) => request.feeling)).toEqual([
        "tension",
      ])
    })

    it("plays on the first touch when sound was left on, though it voices nothing", () => {
      const points = slot().points
      const opened = runtimeOf({ points })
      opened.dispatch({ type: "advance" })
      opened.dispatch({ type: "advance" })
      // Resumed at the root's choice, with no line coming.
      const sound = heldSound()
      const runtime = runtimeOf({ voice: heldVoice(), sound, points })
      runtime.connect()
      expect(sound.requests).toHaveLength(0)
      runtime.dispatch({ type: "reveal", id: "s1-l1" })
      expect(sound.requests.map(({ request }) => request.feeling)).toEqual([
        "tension",
      ])
    })

    it("is cut off by a replay, by sound turned off, and by leaving", async () => {
      const voice = heldVoice()
      const sound = heldSound()
      const runtime = runtimeOf({ voice, sound })
      const disconnect = runtime.connect()
      runtime.dispatch({ type: "advance" })
      runtime.replay("s1-n1")
      expect(sound.requests[0]?.signal.aborted).toBe(true)
      expect(voice.requests[0]?.request).toMatchObject({
        beat: "s1-n1",
        interrupt: true,
      })

      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "choose", option: "b" })
      sound.turn(false)
      expect(sound.requests[1]?.signal.aborted).toBe(true)
      // The line that waited for it is said.
      for (let tick = 0; tick < 4; tick += 1) await Promise.resolve()
      expect(beats(voice).at(-1)).toBe("s3-l1")

      sound.turn(true)
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "choose", option: "y" })
      disconnect()
      expect(sound.requests[2]?.signal.aborted).toBe(true)
    })
  })

  describe("the last session (canon Rem. 4.14)", () => {
    /** Plays root, then `option`, to the leaf's end. */
    const playTo = (runtime: DramaRuntime, option: string): void => {
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "advance" })
      runtime.dispatch({ type: "choose", option })
      while (runtime.getSnapshot().session.drama.at.kind === "beat") {
        runtime.dispatch({ type: "advance" })
      }
    }

    it("keeps the record at each ending, and the review changes it", () => {
      const last = createLastDramaStore(memoryStorage())
      const runtime = runtimeOf({ last })
      expect(runtime.getSnapshot().last).toBeNull()
      playTo(runtime, "a")
      expect(last.get()).toMatchObject({
        lessonId: lesson.id,
        tries: [{ chosen: "네, 감사합니다. 주시면 마실게요.", answered: true }],
      })
      expect(runtime.getSnapshot().last).toEqual(last.get())

      runtime.review({ enjoyed: "loved" })
      expect(last.get()?.review).toEqual({ enjoyed: "loved" })
      expect(runtime.getSnapshot().last?.review).toEqual({ enjoyed: "loved" })

      // A replay to another ending keeps the review.
      runtime.dispatch({ type: "restart" })
      playTo(runtime, "c")
      expect(last.get()?.review).toEqual({ enjoyed: "loved" })
    })

    it("shows no other drama's record", () => {
      const last = createLastDramaStore(memoryStorage())
      last.save({
        lessonId: "another",
        content: "x",
        level: 1,
        title: "x",
        at: Date.now(),
        scenes: [],
        tries: [],
      })
      expect(runtimeOf({ last }).getSnapshot().last).toBeNull()
    })

    it("takes a review only at an ending, and keeps it on screen when storage fails", () => {
      const storage = memoryStorage()
      const runtime = runtimeOf({ last: createLastDramaStore(storage) })
      playTo(runtime, "a")
      // A fresh visit opens on the record, mid-drama: no review yet.
      const again = runtimeOf({ last: createLastDramaStore(storage) })
      expect(again.getSnapshot().last).not.toBeNull()
      again.review({ enjoyed: "fine" })
      expect(again.getSnapshot().last?.review).toBeUndefined()

      storage.full = true
      runtime.review({ enjoyed: "loved" })
      expect(runtime.getSnapshot().last?.review).toEqual({ enjoyed: "loved" })
    })
  })
})
