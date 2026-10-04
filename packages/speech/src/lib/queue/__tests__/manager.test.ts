/**
 * The queue's half of the settlement contract.
 *
 * `adapter-contract.test.ts` proves an adapter settles what it owes. This
 * file proves the queue *acts on* those settlements: that a cancelled
 * utterance stops promptly rather than at the end of the audio, that a
 * failure retries and a cancellation doesn't, that pause actually pauses,
 * and that a disposed session leaves nothing behind for the next one.
 */

import { isAbortError } from "@speech/lib/promise/abort"
import { SpeechQueueManager } from "@speech/lib/queue/manager"
import type { ControllableAdapter } from "@speech/lib/testing"
import {
  createControllableAdapter,
  flushAsync,
  track,
} from "@speech/lib/testing"
import { describe, expect, it } from "vitest"

function setup(): {
  adapter: ControllableAdapter
  manager: SpeechQueueManager
} {
  const adapter = createControllableAdapter()
  return { adapter, manager: new SpeechQueueManager(adapter) }
}

describe("SpeechQueueManager - happy path", () => {
  it("speaks queued items one at a time, in priority order", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "low", undefined, 0)
    manager.speak("c", "high", undefined, 5)
    await flushAsync()

    expect(adapter.calls).toHaveLength(1)
    expect(adapter.calls[0]?.text).toBe("high")

    adapter.finish()
    await flushAsync()

    expect(adapter.calls).toHaveLength(2)
    expect(adapter.calls[1]?.text).toBe("low")

    adapter.finish()
    await flushAsync()

    expect(manager.getStore().get().totalProcessed).toBe(2)
    expect(manager.getStore().get().status).toBe("idle")
    expect(adapter.pending).toBe(0)
  })

  it("hands the item's abort signal to the adapter", async () => {
    const { adapter, manager } = setup()
    manager.speak("c", "hello")
    await flushAsync()

    expect(adapter.calls[0]?.options.signal).toBeInstanceOf(AbortSignal)
    expect(adapter.calls[0]?.options.signal?.aborted).toBe(false)
  })
})

describe("SpeechQueueManager - cancellation", () => {
  it("rejects the in-flight utterance as soon as it is cancelled", async () => {
    const { adapter, manager } = setup()

    manager.speak("chat", "hello")
    await flushAsync()
    const inFlight = track(adapter.calls[0]!.entry.promise)

    manager.cancel("chat")
    await flushAsync()

    // The regression: the old loop only checked `signal.aborted` before and
    // after its await, so a cancel mid-utterance did nothing until the
    // audio ended on its own - and if it never did, the queue parked here
    // forever holding `currentItem`.
    expect(inFlight.state).toBe("rejected")
    expect(isAbortError(inFlight.error)).toBe(true)

    const state = manager.getStore().get()
    expect(state.currentItem).toBeNull()
    expect(state.status).toBe("idle")
    expect(state.totalFailed).toBe(0)
  })

  it("moves on to the next item after a cancellation", async () => {
    const { adapter, manager } = setup()

    manager.speak("chat", "first")
    await flushAsync()
    manager.speak("stepper", "second")
    manager.cancel("chat")
    await flushAsync()

    expect(adapter.calls.at(-1)?.text).toBe("second")
    adapter.finish()
    await flushAsync()
    expect(manager.getStore().get().totalProcessed).toBe(1)
  })

  it("cancels only the component that asked, not everyone else's speech", async () => {
    const { adapter, manager } = setup()

    manager.speak("chat", "chat says hello")
    await flushAsync()
    manager.speak("stepper", "stepper says hello")

    manager.cancel("stepper")
    await flushAsync()

    // The in-flight chat utterance belongs to another component; a
    // component unmounting must not silence it.
    expect(adapter.calls[0]?.entry.isSettled()).toBe(false)
    expect(manager.getStore().get().currentItem?.componentId).toBe("chat")
  })

  it("interrupts a lower-priority utterance for a higher-priority one", async () => {
    const { adapter, manager } = setup()

    manager.speak("chat", "background", undefined, 0)
    await flushAsync()
    const interrupted = track(adapter.calls[0]!.entry.promise)

    manager.speak("alert", "urgent", undefined, 10)
    await flushAsync()

    expect(interrupted.state).toBe("rejected")
    expect(isAbortError(interrupted.error)).toBe(true)
    expect(adapter.calls.at(-1)?.text).toBe("urgent")
  })

  it("clears everything on clear(), leaving no pending promise", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "one")
    await flushAsync()
    manager.speak("c", "two")
    manager.speak("c", "three")

    manager.clear()
    await flushAsync()

    expect(adapter.pending).toBe(0)
    const state = manager.getStore().get()
    expect(state.items).toEqual([])
    expect(state.currentItem).toBeNull()
    expect(state.status).toBe("idle")
  })
})

describe("SpeechQueueManager - failures", () => {
  it("retries a failed utterance up to its budget, then records the failure", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "flaky", undefined, 0, 1)
    await flushAsync()

    adapter.fail(new Error("backend exploded"))
    await flushAsync()

    // One retry, because maxRetries is 1.
    expect(adapter.calls).toHaveLength(2)
    expect(manager.getStore().get().totalFailed).toBe(0)

    adapter.fail(new Error("backend exploded again"))
    await flushAsync()

    const state = manager.getStore().get()
    expect(adapter.calls).toHaveLength(2)
    expect(state.totalFailed).toBe(1)
    expect(state.error).toBe("backend exploded again")
    expect(state.status).toBe("idle")
  })

  it("never retries a cancellation", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "hello", undefined, 0, 3)
    await flushAsync()
    manager.cancel("c")
    await flushAsync()

    expect(adapter.calls).toHaveLength(1)
    expect(manager.getStore().get().totalFailed).toBe(0)
  })
})

describe("SpeechQueueManager - pause", () => {
  it("stays paused after the aborted utterance settles", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "one")
    await flushAsync()
    manager.speak("c", "two")

    manager.pause()
    await flushAsync()

    // The bug this pins: `PAUSE` aborts the current item, the abort lands
    // as `ITEM_CANCELLED`, and that used to reset `status` to "speaking"
    // whenever anything was still queued - so the queue carried on talking
    // through a pause the caller had explicitly asked for.
    expect(manager.getStore().get().status).toBe("paused")
    expect(adapter.calls).toHaveLength(1)

    manager.resume()
    await flushAsync()

    expect(manager.getStore().get().status).toBe("speaking")
    expect(adapter.calls).toHaveLength(2)
  })
})

describe("SpeechQueueManager - disposal", () => {
  it("flushes the in-flight utterance and stops accepting new ones", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "hello")
    await flushAsync()
    const inFlight = track(adapter.calls[0]!.entry.promise)

    manager.dispose()

    expect(adapter.pending).toBe(0)
    await flushAsync()
    expect(isAbortError(inFlight.error)).toBe(true)

    manager.speak("c", "after disposal")
    await flushAsync()

    expect(adapter.calls).toHaveLength(1)
    expect(manager.isDisposed()).toBe(true)
  })

  it("aborts every queued item, so nothing survives to be spoken later", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "one")
    await flushAsync()
    manager.speak("c", "two")
    manager.speak("c", "three")
    const queued = manager.getStore().get().items

    manager.dispose()

    expect(queued.every((item) => item.controller.signal.aborted)).toBe(true)
    expect(adapter.pending).toBe(0)
  })

  it("is idempotent", () => {
    const { adapter, manager } = setup()
    manager.dispose()
    manager.dispose()
    expect(adapter.stopCount).toBe(1)
  })

  it("stops notifying subscribers once disposed", async () => {
    const { manager } = setup()
    const seen: Array<string> = []
    manager.getStore().subscribe(
      (state) => state.status,
      (status) => seen.push(status)
    )

    manager.speak("c", "hello")
    await flushAsync()
    const before = seen.length

    manager.dispose()
    await flushAsync()

    // A component that outlives the session must not be woken by it.
    expect(seen.length).toBe(before)
  })
})

describe("SpeechQueueManager - whenIdle", () => {
  it("resolves once the queue has drained", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "one")
    manager.speak("c", "two")
    await flushAsync()

    const idle = track(manager.whenIdle())
    expect(idle.state).toBe("pending")

    adapter.finish()
    await flushAsync()
    adapter.finish()
    await flushAsync()

    expect(idle.state).toBe("resolved")
  })
})

describe("SpeechQueueManager - muting", () => {
  it("drops utterances rather than queuing them for later", async () => {
    const { adapter, manager } = setup()

    manager.setMuted(true)
    manager.speak("c", "unheard one")
    manager.speak("c", "unheard two")
    await flushAsync()

    expect(adapter.calls).toHaveLength(0)
    expect(manager.getStore().get().items).toEqual([])

    // Unmuting must not replay what the person chose not to hear - minutes
    // of backlog arriving at once is the surprise muting exists to prevent.
    manager.setMuted(false)
    await flushAsync()
    expect(adapter.calls).toHaveLength(0)
  })

  it("silences what is already speaking, immediately", async () => {
    const { adapter, manager } = setup()

    manager.speak("c", "mid-sentence")
    await flushAsync()
    const inFlight = track(adapter.calls[0]!.entry.promise)

    manager.setMuted(true)

    // Not "after the current paragraph" - a person who mutes wants quiet now.
    expect(adapter.pending).toBe(0)
    await flushAsync()
    expect(isAbortError(inFlight.error)).toBe(true)
    expect(manager.getStore().get().currentItem).toBeNull()
  })

  it("speaks again after unmuting", async () => {
    const { adapter, manager } = setup()

    manager.setMuted(true)
    manager.setMuted(false)
    manager.speak("c", "heard")
    await flushAsync()

    expect(adapter.calls.at(0)?.text).toBe("heard")
  })

  it("is idempotent, and a no-op once disposed", () => {
    const { adapter, manager } = setup()

    manager.setMuted(true)
    manager.setMuted(true)
    expect(adapter.stopCount).toBe(1)

    manager.dispose()
    manager.setMuted(false)
    expect(manager.isMuted()).toBe(true)
  })
})

describe("SpeechQueueManager - the speaker", () => {
  it("says a line in its language, and resolves once it is heard", async () => {
    const { adapter, manager } = setup()

    const line = manager.speakerFor("a").say("안녕", { language: "korean" })
    await flushAsync()
    expect(adapter.calls[0]?.options.language).toBe("korean")
    adapter.finish()

    expect(await line).toEqual({ kind: "heard" })
  })

  it("refuses a line while muted: nothing reaches the adapter", async () => {
    const { adapter, manager } = setup()
    manager.setMuted(true)

    const outcome = await manager
      .speakerFor("a")
      .say("안녕", { language: "korean" })

    expect(outcome).toEqual({ kind: "muted" })
    expect(adapter.calls).toHaveLength(0)
  })

  it("says a line playing, and one waiting, were muted when the session is", async () => {
    const { manager } = setup()
    const speaker = manager.speakerFor("a")

    const playing = speaker.say("하나", { language: "korean" })
    const waiting = speaker.say("둘", { language: "korean" })
    await flushAsync()
    manager.setMuted(true)

    expect(await playing).toEqual({ kind: "muted" })
    expect(await waiting).toEqual({ kind: "muted" })
  })

  it("reports a failed line, feeds it into the session's health, and a heard one clears it", async () => {
    const { adapter, manager } = setup()
    const speaker = manager.speakerFor("a")

    const failed = speaker.say("하나", { language: "korean" })
    await flushAsync()
    adapter.fail(new Error("tts down"))
    const outcome = await failed
    expect(outcome.kind).toBe("failed")
    expect(manager.getStore().get().error).toBe("tts down")

    const heard = speaker.say("둘", { language: "korean" })
    await flushAsync()
    adapter.finish()
    await heard
    expect(manager.getStore().get().error).toBeNull()
  })

  it("stops only the handle's own lines, and calls that cancelled, not failed", async () => {
    const { adapter, manager } = setup()
    const lesson = manager.speakerFor("lesson")
    const chat = manager.speakerFor("chat")

    const mine = lesson.say("하나", { language: "korean" })
    const theirs = chat.say("둘", { language: "korean" })
    await flushAsync()
    lesson.stop()
    expect(await mine).toEqual({ kind: "cancelled" })
    expect(manager.getStore().get().error).toBeNull()

    await flushAsync()
    adapter.finish()
    expect(await theirs).toEqual({ kind: "heard" })
  })

  it("cancels a line whose signal aborts, playing or waiting", async () => {
    const { manager } = setup()
    const speaker = manager.speakerFor("a")
    const first = new AbortController()
    const second = new AbortController()

    const playing = speaker.say("하나", {
      language: "korean",
      signal: first.signal,
    })
    const waiting = speaker.say("둘", {
      language: "korean",
      signal: second.signal,
    })
    await flushAsync()
    second.abort()
    first.abort()

    expect(await waiting).toEqual({ kind: "cancelled" })
    expect(await playing).toEqual({ kind: "cancelled" })
  })

  it("lets a 'now' line interrupt a 'next' one, then plays the 'next' one again", async () => {
    const { adapter, manager } = setup()
    const interrupted: Array<string> = []

    const lesson = manager.speakerFor("lesson").say("하나", {
      language: "korean",
      onInterrupted: () => interrupted.push("lesson"),
    })
    await flushAsync()
    const tap = manager
      .speakerFor("word")
      .say("둘", { language: "korean", urgency: "now" })
    await flushAsync()

    expect(interrupted).toEqual(["lesson"])
    expect(adapter.calls.map((call) => call.text)).toEqual(["하나", "둘"])
    adapter.finish()
    expect(await tap).toEqual({ kind: "heard" })

    // The lesson's line, from the start, after the tap's.
    await flushAsync()
    expect(adapter.calls.map((call) => call.text)).toEqual([
      "하나",
      "둘",
      "하나",
    ])
    adapter.finish()
    expect(await lesson).toEqual({ kind: "heard" })
  })

  it("lets a later 'now' line interrupt an earlier one, which is not replayed", async () => {
    const { adapter, manager } = setup()

    const first = manager
      .speakerFor("a")
      .say("하나", { language: "korean", urgency: "now" })
    await flushAsync()
    const second = manager
      .speakerFor("b")
      .say("둘", { language: "korean", urgency: "now" })

    expect(await first).toEqual({ kind: "preempted" })
    await flushAsync()
    adapter.finish()
    expect(await second).toEqual({ kind: "heard" })
    await flushAsync()
    expect(adapter.calls.map((call) => call.text)).toEqual(["하나", "둘"])
  })

  it("replays a 'next' line the queue's higher-priority item interrupted", async () => {
    const { adapter, manager } = setup()

    const lesson = manager
      .speakerFor("lesson")
      .say("하나", { language: "korean" })
    await flushAsync()
    manager.speak("chat", "hello", undefined, 5)
    await flushAsync()
    adapter.finish()
    await flushAsync()
    adapter.finish()

    expect(await lesson).toEqual({ kind: "heard" })
    expect(adapter.calls.map((call) => call.text)).toEqual([
      "하나",
      "hello",
      "하나",
    ])
  })

  it("ends every line, playing or waiting, when the session ends", async () => {
    const { manager } = setup()
    const speaker = manager.speakerFor("a")

    const playing = speaker.say("하나", { language: "korean" })
    const waiting = speaker.say("둘", { language: "korean" })
    await flushAsync()
    manager.dispose()

    expect(await playing).toEqual({ kind: "ended" })
    expect(await waiting).toEqual({ kind: "ended" })
    expect(await speaker.say("셋", { language: "korean" })).toEqual({
      kind: "ended",
    })
  })

  it("tells subscribers when mute changes, and says whether it is muted", () => {
    const { manager } = setup()
    const speaker = manager.speakerFor("a")
    const seen: Array<boolean> = []
    const unsubscribe = speaker.subscribe(() => {
      seen.push(speaker.muted)
    })

    manager.setMuted(true)
    manager.setMuted(true)
    manager.setMuted(false)
    unsubscribe()
    manager.setMuted(true)

    expect(seen).toEqual([true, false])
  })
})
