import { DARK_THEME_ATTR } from "@filter/lib/content/theme-apply"
import { createSessionLifecycle } from "@some-extension/transport/session/lifecycle"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createContentSession, scan } from "../pipeline"
import { SWATCHES } from "../swatches"

const STYLE_ID = "__sw_dark_theme"
const DYNAMIC_STYLE_ID = "__sw_dark_dynamic"

function cleanUp(): void {
  document.documentElement.removeAttribute(DARK_THEME_ATTR)
  document.getElementById(STYLE_ID)?.remove()
  document.getElementById(DYNAMIC_STYLE_ID)?.remove()
  document.querySelectorAll("[data-sw-patched]").forEach((el) => {
    el.removeAttribute("data-sw-patched")
  })
  document.body.innerHTML = ""
}

afterEach(() => {
  cleanUp()
})

describe("scan", () => {
  it("groups elements by their canonical background key", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(255, 255, 255)"></div>' +
      '<div id="b" style="background-color: rgb(255, 255, 255)"></div>'

    const { elementsByKey } = scan(document.body)

    const key = "rgb(255, 255, 255)"
    expect(elementsByKey.get(key)?.map((el) => el.id)).toEqual(["a", "b"])
  })

  it("does not classify root itself, only descendants", () => {
    document.body.style.backgroundColor = "rgb(255, 255, 255)"
    const { elementsByKey } = scan(document.body)
    for (const elements of elementsByKey.values()) {
      expect(elements).not.toContain(document.body)
    }
  })

  it("skips extension-owned nodes and their descendants", () => {
    document.body.innerHTML =
      '<div data-my-ext><div id="inner" style="background-color: rgb(255, 255, 255)"></div></div>'

    const { elementsByKey } = scan(document.body)

    for (const elements of elementsByKey.values()) {
      expect(elements.some((el) => el.id === "inner")).toBe(false)
    }
  })

  it("skips media/script tags", () => {
    document.body.innerHTML = "<img /><video></video><style>a{}</style>"
    const { elementsByKey } = scan(document.body)
    expect(elementsByKey.size).toBe(0)
  })

  it("finds no evidence on a page with no explicit backgrounds anywhere", () => {
    document.body.innerHTML = "<main><h1>hi</h1></main>"
    const { elementsByKey, attrsByKey } = scan(document.body)
    expect(elementsByKey.size).toBe(0)
    expect(attrsByKey.size).toBe(0)
  })
})

describe("createContentSession — coalescing (Definition 7.2)", () => {
  it("a burst of N mutations within the debounce window triggers exactly one decide/realize cycle", () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML = '<div id="a"></div>'
      const session = createSessionLifecycle()
      let fireCount = 0
      const contentSession = createContentSession(
        SWATCHES.default,
        session,
        () => {
          fireCount += 1
        }
      )

      const target = document.getElementById("a")
      expect(target).not.toBeNull()
      if (target === null) return

      // A burst of rescans well within the 50ms reconcile window.
      for (let i = 0; i < 10; i++) {
        target.style.backgroundColor = `rgb(${i}, ${i}, ${i})`
        contentSession.rescan()
      }

      expect(fireCount).toBe(0) // nothing has fired yet — still coalescing

      vi.advanceTimersByTime(100)

      expect(fireCount).toBe(1)

      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("two well-separated rescans (past the debounce window) fire twice", () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML = '<div id="a"></div>'
      const session = createSessionLifecycle()
      let fireCount = 0
      const contentSession = createContentSession(
        SWATCHES.default,
        session,
        () => {
          fireCount += 1
        }
      )

      contentSession.rescan()
      vi.advanceTimersByTime(100)
      expect(fireCount).toBe(1)

      contentSession.rescan()
      vi.advanceTimersByTime(100)
      expect(fireCount).toBe(2)

      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("createContentSession — end to end", () => {
  it("a light page's div gets tagged and colored after the coalesced cycle fires", () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML =
        '<div id="a" style="background-color: rgb(255, 255, 255)"></div>'
      const session = createSessionLifecycle()
      const contentSession = createContentSession(SWATCHES.default, session)

      contentSession.rescan()
      vi.advanceTimersByTime(100)

      expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)
      const target = document.getElementById("a")
      expect(target?.dataset.swPatched).toBe("rgb(255, 255, 255)")

      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("a genuinely dark page (mean luminance low) restores native instead of tagging", () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML =
        '<div id="a" style="background-color: rgb(13, 17, 23)"></div>'
      const session = createSessionLifecycle()
      const contentSession = createContentSession(SWATCHES.default, session)

      contentSession.rescan()
      vi.advanceTimersByTime(100)

      expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
      const target = document.getElementById("a")
      expect(target?.dataset.swPatched).toBeUndefined()

      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })
})
