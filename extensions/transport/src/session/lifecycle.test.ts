import { describe, expect, it, vi } from "vitest"

import { initialEpoch } from "./epoch"
import { createSessionLifecycle, type SessionResetEvent } from "./lifecycle"

describe("session/lifecycle", () => {
  it("starts at the initial epoch with no reset yet performed", () => {
    const session = createSessionLifecycle()
    expect(session.epoch).toBe(initialEpoch())
  })

  it("resetContent() advances the epoch and reports kind 'content'", () => {
    const session = createSessionLifecycle()
    const event = session.resetContent()

    expect(event.kind).toBe("content")
    expect(event.epoch).toBe(session.epoch)
    expect(session.epoch).not.toBe(initialEpoch())
  })

  it("resetDocument() advances the epoch and reports kind 'document'", () => {
    const session = createSessionLifecycle()
    const event = session.resetDocument()

    expect(event.kind).toBe("document")
    expect(event.epoch).toBe(session.epoch)
  })

  it("both reset paths advance the same underlying epoch counter", () => {
    const session = createSessionLifecycle()
    const content = session.resetContent()
    const document = session.resetDocument()

    expect(document.epoch).toBeGreaterThan(content.epoch)
  })

  it("invokes the injected onReset callback for both reset paths, never touching Estimator internals directly", () => {
    const events: Array<SessionResetEvent> = []
    const session = createSessionLifecycle({
      onReset: (event) => events.push(event),
    })

    session.resetContent()
    session.resetDocument()

    expect(events).toHaveLength(2)
    expect(events[0]?.kind).toBe("content")
    expect(events[1]?.kind).toBe("document")
  })

  it("has no navigation-detection heuristic of its own — callers drive resets explicitly", () => {
    const onReset = vi.fn()
    const session = createSessionLifecycle({ onReset })

    expect(onReset).not.toHaveBeenCalled()
    expect(session.epoch).toBe(initialEpoch())
  })
})
