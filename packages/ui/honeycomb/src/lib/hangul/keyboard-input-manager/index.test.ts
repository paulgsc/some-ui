import { describe, expect, it } from "vitest"

import { KeyboardInputManager } from "@honeycomb/lib/hangul/keyboard-input-manager"

describe("addKey / getBuffer", () => {
  it("preserves insertion order across multiple keys", () => {
    const manager = new KeyboardInputManager(300)
    manager.addKey("h", 0)
    manager.addKey("k", 10)
    manager.addKey("t", 20)

    expect(manager.getBuffer()).toBe("hkt")
  })

  it("drops keys older than the timeout when a new key arrives", () => {
    const manager = new KeyboardInputManager(300)
    manager.addKey("h", 0)
    manager.addKey("k", 100)
    // Arrives 301ms after "h", pushing it past the 300ms timeout.
    manager.addKey("t", 301)

    expect(manager.getBuffer()).toBe("kt")
  })

  it("drops every key when all of them are older than the timeout", () => {
    const manager = new KeyboardInputManager(300)
    manager.addKey("h", 0)
    manager.addKey("k", 50)
    manager.addKey("t", 500)

    expect(manager.getBuffer()).toBe("t")
  })
})

describe("clearBuffer / reset", () => {
  it("clearBuffer empties the buffer", () => {
    const manager = new KeyboardInputManager()
    manager.addKey("h", 0)

    manager.clearBuffer()

    expect(manager.getBuffer()).toBe("")
  })

  it("reset empties the buffer", () => {
    const manager = new KeyboardInputManager()
    manager.addKey("h", 0)

    manager.reset()

    expect(manager.getBuffer()).toBe("")
  })
})

describe("shouldClearBuffer", () => {
  it("is false for an empty buffer", () => {
    const manager = new KeyboardInputManager(300)
    expect(manager.shouldClearBuffer(1000)).toBe(false)
  })

  it("is false while within the timeout window of the oldest key", () => {
    const manager = new KeyboardInputManager(300)
    manager.addKey("h", 0)

    expect(manager.shouldClearBuffer(300)).toBe(false)
  })

  it("is true once the oldest key exceeds the timeout window", () => {
    const manager = new KeyboardInputManager(300)
    manager.addKey("h", 0)

    expect(manager.shouldClearBuffer(301)).toBe(true)
  })

  it("reports timeout based on the oldest key, not the newest", () => {
    const manager = new KeyboardInputManager(300)
    manager.addKey("h", 0)
    manager.addKey("k", 250)

    // 250ms after the newest key, but 500ms after the oldest.
    expect(manager.shouldClearBuffer(500)).toBe(true)
  })
})

describe("constructor", () => {
  it("honors a custom bufferTimeoutMs", () => {
    const manager = new KeyboardInputManager(50)
    manager.addKey("h", 0)

    expect(manager.shouldClearBuffer(51)).toBe(true)
  })
})
