import type { Presented, VoicePort, VoiceRequest } from "@some-ui/makjang"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import { DramaRuntime } from "@topik/lib/topik/core/drama-runtime"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { describe, expect, it, vi } from "vitest"

const lesson = workedLesson()

/** A voice whose lines end only when the test says so. */
function heldVoice(): VoicePort & {
  requests: Array<{ request: VoiceRequest; signal: AbortSignal }>
  finish: (index: number, outcome?: Presented) => Promise<void>
} {
  const requests: Array<{ request: VoiceRequest; signal: AbortSignal }> = []
  const ends: Array<(outcome: Presented) => void> = []
  return {
    requests,
    voice: (request, signal): Promise<Presented> => {
      requests.push({ request, signal })
      return new Promise((resolve) => ends.push(resolve))
    },
    finish: async (index, outcome = "presented"): Promise<void> => {
      ends[index]?.(outcome)
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

function memoryPoints(held?: unknown): DramaPointStore & {
  saved: Map<string, unknown>
} {
  const saved = new Map<string, unknown>()
  if (held !== undefined) saved.set(lesson.id, held)
  return { saved, get: (id) => saved.get(id), set: (id, p) => saved.set(id, p) }
}

describe("DramaRuntime", () => {
  it("voices nothing until the learner touches the lesson", () => {
    const voice = heldVoice()
    const runtime = new DramaRuntime(lesson, { voice, points: memoryPoints() })
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
    const runtime = new DramaRuntime(lesson, { voice, points: memoryPoints() })
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

  it("keeps the engine's resume point, and resumes from it", () => {
    const points = memoryPoints()
    const runtime = new DramaRuntime(lesson, { voice: null, points })
    runtime.dispatch({ type: "advance" })
    runtime.dispatch({ type: "advance" })
    runtime.dispatch({ type: "choose", option: "b" })
    expect(points.saved.get(lesson.id)).toEqual(
      runtime.getSnapshot().session.drama
    )

    const again = new DramaRuntime(lesson, { voice: null, points })
    expect(again.getSnapshot().session.drama).toEqual(
      runtime.getSnapshot().session.drama
    )
  })

  it("opens at the root when the stored point no longer resolves", () => {
    const runtime = new DramaRuntime(lesson, {
      voice: null,
      points: memoryPoints({ route: ["gone"], at: { kind: "end" }, first: {} }),
    })
    expect(runtime.getSnapshot().session.drama.route).toEqual([])
  })

  it("starts the ladder at Hangul with no voice", () => {
    const runtime = new DramaRuntime(lesson, {
      voice: null,
      points: memoryPoints(),
    })
    expect(runtime.getSnapshot().session.audio).toBe(false)
  })

  it("stops the line on dispose, and waits for a touch before the next", () => {
    const voice = heldVoice()
    const runtime = new DramaRuntime(lesson, { voice, points: memoryPoints() })
    const listener = vi.fn()
    runtime.subscribe(listener)
    runtime.dispatch({ type: "advance" })
    runtime.dispose()
    expect(voice.requests[0]?.signal.aborted).toBe(true)
    expect(listener).toHaveBeenCalled()
  })
})
