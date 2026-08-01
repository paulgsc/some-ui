/**
 * Session isolation: the bug report, written as tests.
 *
 * "Prior state survives to poison a new session" had two halves. The queue
 * wedged on promises that never settled (covered in `manager.test.ts`), and
 * the singleton could only ever be initialized once - so the session that
 * replaced it inherited the wedge. These tests are about the second half:
 * whatever a session was holding when it ended, the next one starts clean.
 */

import { isAbortError } from "@speech/lib/promise/abort"
import {
  createControllableAdapter,
  flushAsync,
  track,
} from "@speech/lib/testing"
import { afterEach, describe, expect, it } from "vitest"

import {
  getSpeechQueue,
  initializeSpeechQueue,
  peekSpeechQueue,
  releaseSpeechQueue,
  resetSpeechQueue,
} from "./singleton"

afterEach(() => {
  resetSpeechQueue()
})

describe("speech queue singleton", () => {
  it("throws a directed error when nothing has been initialized", () => {
    expect(() => getSpeechQueue()).toThrow(/not initialized/i)
    expect(peekSpeechQueue()).toBeNull()
  })

  it("returns the same manager when re-initialized with the same adapter", () => {
    const adapter = createControllableAdapter()

    const first = initializeSpeechQueue(adapter)
    const second = initializeSpeechQueue(adapter)

    // React Strict Mode double-invokes effects; that must not churn the
    // queue out from under whatever is already speaking through it.
    expect(second).toBe(first)
    expect(adapter.disposeCount).toBe(0)
  })

  it("starts a fresh session when the adapter changes", async () => {
    const firstAdapter = createControllableAdapter()
    const firstManager = initializeSpeechQueue(firstAdapter)

    firstManager.speak("chat", "from the old session")
    await flushAsync()
    const stranded = track(firstAdapter.calls[0]!.entry.promise)
    firstManager.speak("chat", "also from the old session")

    const secondAdapter = createControllableAdapter()
    const secondManager = initializeSpeechQueue(secondAdapter)

    expect(secondManager).not.toBe(firstManager)
    expect(firstManager.isDisposed()).toBe(true)

    // Nothing the old session owed is still outstanding...
    expect(firstAdapter.pending).toBe(0)
    await flushAsync()
    expect(isAbortError(stranded.error)).toBe(true)

    // ...and nothing it held carried over.
    const state = secondManager.getStore().get()
    expect(state.items).toEqual([])
    expect(state.currentItem).toBeNull()
    expect(state.status).toBe("idle")
    expect(state.totalProcessed).toBe(0)
    expect(secondAdapter.calls).toHaveLength(0)
  })

  it("speaks through the new session's adapter, not the old one", async () => {
    const firstAdapter = createControllableAdapter()
    initializeSpeechQueue(firstAdapter)

    const secondAdapter = createControllableAdapter()
    const manager = initializeSpeechQueue(secondAdapter)

    manager.speak("chat", "hello")
    await flushAsync()

    // The old singleton handed back the *first* manager on every later
    // call, so a page that switched TTS provider kept talking through the
    // provider it had just torn down.
    expect(secondAdapter.calls).toHaveLength(1)
    expect(firstAdapter.calls).toHaveLength(0)
  })

  it("replaces a disposed session even when the adapter is unchanged", () => {
    const adapter = createControllableAdapter()
    const first = initializeSpeechQueue(adapter)
    first.dispose()

    const second = initializeSpeechQueue(adapter)

    expect(second).not.toBe(first)
    expect(second.isDisposed()).toBe(false)
  })

  it("treats a disposed session as no session at all", () => {
    const manager = initializeSpeechQueue(createControllableAdapter())
    manager.dispose()

    expect(peekSpeechQueue()).toBeNull()
    expect(() => getSpeechQueue()).toThrow(/not initialized/i)
  })

  it("resetSpeechQueue is safe with no session, and safe twice", () => {
    expect(() => resetSpeechQueue()).not.toThrow()
    initializeSpeechQueue(createControllableAdapter())
    resetSpeechQueue()
    expect(() => resetSpeechQueue()).not.toThrow()
    expect(peekSpeechQueue()).toBeNull()
  })
})

describe("releaseSpeechQueue - out-of-order teardown", () => {
  it("ends the session it is given when that session is still live", () => {
    const manager = initializeSpeechQueue(createControllableAdapter())

    releaseSpeechQueue(manager)

    expect(manager.isDisposed()).toBe(true)
    expect(peekSpeechQueue()).toBeNull()
  })

  it("does not tear down the session that already replaced it", () => {
    const oldManager = initializeSpeechQueue(createControllableAdapter())
    const newManager = initializeSpeechQueue(createControllableAdapter())

    // React runs the previous effect's cleanup *after* the next effect has
    // installed its session. An unconditional reset here would kill the
    // session that just started.
    releaseSpeechQueue(oldManager)

    expect(newManager.isDisposed()).toBe(false)
    expect(peekSpeechQueue()).toBe(newManager)
  })
})
