// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Importing for its side effects: registers the page listeners and installs the
// `window.isReceivingFormInput` / `window.lastVisit` contract. A content script
// is injected exactly once, so the module is imported once here too.
import "./watch"

/** Dispatch a keydown carrying a specific `key` value. */
function fireKeydown(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
}

/** Dispatch a bubbling visibilitychange so the window-level listener sees it. */
function fireVisibilityChange(): void {
  document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ""
  // a submit clears the dirty-input latch the same way a real form would.
  window.dispatchEvent(new Event("submit"))
})

describe("watch — unsaved form input", () => {
  it("starts clean", () => {
    expect(window.isReceivingFormInput).toBe(false)
  })

  it("latches when a printable key is typed into an input with content", () => {
    const input = document.createElement("input")
    input.value = "draft"
    document.body.appendChild(input)

    fireKeydown(input, "a")

    expect(window.isReceivingFormInput).toBe(true)
  })

  it("ignores non-printable keys (e.g. arrow/escape)", () => {
    const input = document.createElement("input")
    input.value = "draft"
    document.body.appendChild(input)

    fireKeydown(input, "Escape") // multi-char key name — not printable

    expect(window.isReceivingFormInput).toBe(false)
  })

  it("ignores typing into a non-editable element", () => {
    const div = document.createElement("div")
    document.body.appendChild(div)

    fireKeydown(div, "a")

    expect(window.isReceivingFormInput).toBe(false)
  })

  it("clears the latch on submit", () => {
    const input = document.createElement("input")
    input.value = "draft"
    document.body.appendChild(input)
    fireKeydown(input, "a")
    expect(window.isReceivingFormInput).toBe(true)

    window.dispatchEvent(new Event("submit"))

    expect(window.isReceivingFormInput).toBe(false)
  })

  it("stops blocking once the tracked field is emptied", () => {
    const input = document.createElement("input")
    input.value = "draft"
    document.body.appendChild(input)
    fireKeydown(input, "a")
    expect(window.isReceivingFormInput).toBe(true)

    input.value = ""

    expect(window.isReceivingFormInput).toBe(false)
  })
})

describe("watch — visibility / activity", () => {
  afterEach(() => {
    // restore the default jsdom `document.hidden` getter between tests.
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    })
  })

  it("refreshes window.lastVisit on visibility change", () => {
    const before = window.lastVisit
    vi.spyOn(Date, "now").mockReturnValue(before + 1000)

    fireVisibilityChange()

    expect(window.lastVisit).toBe(before + 1000)
  })

  it("sends TAB_ACTIVE with a timestamp when foregrounded", () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    })

    fireVisibilityChange()

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "TAB_ACTIVE",
      timestamp: window.lastVisit,
    })
  })

  it("sends TAB_IDLE when backgrounded", () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    })

    fireVisibilityChange()

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "TAB_IDLE",
    })
  })

  it("does not throw when sendMessage rejects (no receiver)", () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValueOnce(
      new Error("Could not establish connection")
    )

    expect(() => fireVisibilityChange()).not.toThrow()
  })
})
