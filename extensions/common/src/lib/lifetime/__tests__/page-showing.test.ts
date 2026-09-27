import { Disposables } from "@common/lib/lifetime/disposables"
import {
  isPageShowing,
  watchPageShowing,
} from "@common/lib/lifetime/page-showing"
import { afterEach, describe, expect, it, vi } from "vitest"

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

afterEach(() => setVisibility("visible"))

describe("page showing", () => {
  it("follows tab visibility, and stops watching when its lifetime ends", () => {
    setVisibility("visible")
    const life = new Disposables()
    const onChange = vi.fn()
    watchPageShowing(life, onChange)

    setVisibility("hidden")
    expect(isPageShowing()).toBe(false)
    setVisibility("visible")
    expect(onChange.mock.calls).toEqual([[false], [true]])

    life.dispose()
    setVisibility("hidden")
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it("treats fullscreen as not showing", () => {
    Object.defineProperty(document, "fullscreenElement", {
      value: document.body,
      configurable: true,
    })
    expect(isPageShowing()).toBe(false)
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    })
    expect(isPageShowing()).toBe(true)
  })
})
