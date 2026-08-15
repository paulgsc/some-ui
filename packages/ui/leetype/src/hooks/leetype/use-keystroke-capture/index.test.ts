import { createRef } from "react"
import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useKeystrokeCapture } from "."

type Harness = {
  element: HTMLTextAreaElement
  onKey: ReturnType<typeof vi.fn>
  onBackspace: ReturnType<typeof vi.fn>
  onToggleReveal: ReturnType<typeof vi.fn>
  unmount: () => void
}

function mount({ enabled = true } = {}): Harness {
  const element = document.createElement("textarea")
  document.body.append(element)

  // Stands in for the ref React would have populated after mounting the
  // real <textarea>.
  const ref = createRef<HTMLTextAreaElement>()
  ref.current = element

  const onKey = vi.fn()
  const onBackspace = vi.fn()
  const onToggleReveal = vi.fn()

  const { unmount } = renderHook(() =>
    useKeystrokeCapture(ref, { onKey, onBackspace, onToggleReveal, enabled })
  )

  return { element, onKey, onBackspace, onToggleReveal, unmount }
}

function keydown(
  element: HTMLElement,
  key: string,
  modifiers: KeyboardEventInit = {}
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  })
  element.dispatchEvent(event)
  return event
}

function beforeinput(
  element: HTMLElement,
  inputType: string,
  data: string | null
): Event {
  // jsdom has no InputEvent constructor with `data` in every version, so
  // this builds the shape the listener actually reads.
  const event = new Event("beforeinput", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "inputType", { value: inputType })
  Object.defineProperty(event, "data", { value: data })
  element.dispatchEvent(event)
  return event
}

beforeEach(() => {
  document.body.replaceChildren()
})

describe("keydown", () => {
  it("forwards a printable key and suppresses the browser's own edit", () => {
    const { element, onKey } = mount()

    const event = keydown(element, "a")

    expect(onKey).toHaveBeenCalledWith("a")
    expect(event.defaultPrevented).toBe(true)
  })

  it("forwards the space bar like any other character", () => {
    const { element, onKey } = mount()
    keydown(element, " ")
    expect(onKey).toHaveBeenCalledWith(" ")
  })

  it("routes Backspace to the backspace command", () => {
    const { element, onKey, onBackspace } = mount()

    const event = keydown(element, "Backspace")

    expect(onBackspace).toHaveBeenCalledTimes(1)
    expect(onKey).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it("swallows Enter without scoring or acting on it", () => {
    const { element, onKey, onBackspace, onToggleReveal } = mount()

    const enter = keydown(element, "Enter")

    expect(onKey).not.toHaveBeenCalled()
    expect(onBackspace).not.toHaveBeenCalled()
    expect(onToggleReveal).not.toHaveBeenCalled()
    expect(enter.defaultPrevented).toBe(true)
  })

  it("routes Tab to the reveal toggle instead of scoring or moving focus", () => {
    const { element, onKey, onToggleReveal } = mount()

    const tab = keydown(element, "Tab")

    expect(onToggleReveal).toHaveBeenCalledTimes(1)
    expect(onKey).not.toHaveBeenCalled()
    // Must not walk focus out of the card mid-run.
    expect(tab.defaultPrevented).toBe(true)
  })

  it("fires the reveal toggle once per physical press, not once per key-repeat event", () => {
    const { element, onToggleReveal } = mount()

    keydown(element, "Tab")
    keydown(element, "Tab", { repeat: true })
    keydown(element, "Tab", { repeat: true })

    expect(onToggleReveal).toHaveBeenCalledTimes(1)
  })

  it("ignores named non-printable keys", () => {
    const { element, onKey } = mount()

    for (const key of ["ArrowLeft", "Shift", "F5", "Escape"]) {
      keydown(element, key)
    }

    expect(onKey).not.toHaveBeenCalled()
  })

  it("leaves modifier chords to the browser", () => {
    const { element, onKey } = mount()

    const copy = keydown(element, "c", { metaKey: true })
    keydown(element, "r", { ctrlKey: true })
    keydown(element, "a", { altKey: true })

    expect(onKey).not.toHaveBeenCalled()
    expect(copy.defaultPrevented).toBe(false)
  })

  it("does nothing at all while disabled", () => {
    const { element, onKey, onBackspace } = mount({ enabled: false })

    keydown(element, "a")
    keydown(element, "Backspace")

    expect(onKey).not.toHaveBeenCalled()
    expect(onBackspace).not.toHaveBeenCalled()
  })

  it("detaches its listeners on unmount", () => {
    const { element, onKey, unmount } = mount()

    unmount()
    keydown(element, "a")

    expect(onKey).not.toHaveBeenCalled()
  })
})

describe("beforeinput (soft keyboards and IME)", () => {
  it("forwards inserted text one character at a time", () => {
    const { element, onKey } = mount()

    const event = beforeinput(element, "insertText", "fn")

    expect(onKey.mock.calls).toEqual([["f"], ["n"]])
    expect(event.defaultPrevented).toBe(true)
  })

  it("splits inserted text by code point, not UTF-16 code unit", () => {
    const { element, onKey } = mount()
    beforeinput(element, "insertText", "a🙂")
    expect(onKey.mock.calls).toEqual([["a"], ["🙂"]])
  })

  it("maps a backward deletion to the backspace command", () => {
    const { element, onBackspace } = mount()
    beforeinput(element, "deleteContentBackward", null)
    expect(onBackspace).toHaveBeenCalledTimes(1)
  })

  it("refuses paste rather than dumping a whole buffer into the engine", () => {
    const { element, onKey } = mount()

    const event = beforeinput(element, "insertFromPaste", "the whole file")

    expect(onKey).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })
})
