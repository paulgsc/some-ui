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

  it("skips already-patched elements — their live color is the actuator's own output, not vendor evidence", () => {
    // Once actuator.ts tags an element data-sw-patched and injects its
    // !important hue-preserving rule, getComputedStyle on that element
    // returns *our* darkened color forever after, never the vendor's
    // original. Re-including it in the next scan feeds that self-inflicted
    // color back into the (append-only, never-forgetting) hypothesis as if
    // it were new evidence — the exact mechanism that let pageAlreadyDark()
    // drift downward across repeated reactive rescans until it incorrectly
    // concluded the page was already dark and restore-native undid the
    // theme with no vendor change involved at all.
    document.body.innerHTML =
      '<div id="a" data-sw-patched="rgb(255, 255, 255)" style="background-color: rgb(13, 17, 23)"></div>'
    const { elementsByKey, attrsByKey } = scan(document.body)
    expect(elementsByKey.size).toBe(0)
    expect(attrsByKey.size).toBe(0)
  })
})

describe("createContentSession — rescan() is immediate, not coalesced", () => {
  it("rescan() settles synchronously — no timer, no caller-visible delay", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(255, 255, 255)"></div>'
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

    expect(fireCount).toBe(1)
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)
    const target = document.getElementById("a")
    expect(target?.dataset.swPatched).toBe("rgb(255, 255, 255)")

    contentSession.teardown()
  })

  it("a genuinely dark page (mean luminance low) restores native instead of tagging, immediately", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23)"></div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    const target = document.getElementById("a")
    expect(target?.dataset.swPatched).toBeUndefined()

    contentSession.teardown()
  })

  it("repeated rescan() calls each settle immediately (N calls -> N fires)", () => {
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

    for (let i = 0; i < 5; i++) {
      contentSession.rescan()
    }

    expect(fireCount).toBe(5)

    contentSession.teardown()
  })
})

describe("createContentSession — observer coalescing (Definition 7.2)", () => {
  it("a burst of N real mutations within the debounce window triggers exactly one decide/realize cycle", async () => {
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

      contentSession.observe()

      // A burst of real style mutations, well within the 50ms reconcile window.
      for (let i = 0; i < 10; i++) {
        target.style.backgroundColor = `rgb(${i}, ${i}, ${i})`
      }
      // Flush the MutationObserver's own microtask-scheduled delivery --
      // independent of (and not advanced by) the fake macrotask clock.
      await Promise.resolve()
      await Promise.resolve()

      expect(fireCount).toBe(0) // ingested, but still coalescing -- no fire yet

      vi.advanceTimersByTime(100)

      expect(fireCount).toBe(1)

      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("two well-separated mutations (past the debounce window) fire twice", async () => {
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

      contentSession.observe()

      target.style.backgroundColor = "rgb(1, 1, 1)"
      await Promise.resolve()
      vi.advanceTimersByTime(100)
      expect(fireCount).toBe(1)

      target.style.backgroundColor = "rgb(2, 2, 2)"
      await Promise.resolve()
      vi.advanceTimersByTime(100)
      expect(fireCount).toBe(2)

      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("createContentSession — observer survives body replacement", () => {
  it("keeps reacting to mutations after document.body is wholesale-replaced", async () => {
    // A real SPA/hydration pattern (documentElement.replaceChild(newBody,
    // document.body)), not just a churn-suite construction: observing the
    // old body element directly would keep watching an orphaned, detached
    // node forever once it's replaced -- nothing under the *new* body would
    // ever be seen again, silently killing all future reclassification.
    // Watching document.documentElement (never itself replaced by this
    // pattern) and reading document.body live at fire time is what this
    // test guards.
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

      contentSession.observe()

      const newBody = document.createElement("body")
      newBody.innerHTML = '<div id="b"></div>'
      document.documentElement.replaceChild(newBody, document.body)

      const target = document.getElementById("b")
      expect(target).not.toBeNull()
      if (target === null) return

      target.style.backgroundColor = "rgb(9, 9, 9)"
      await Promise.resolve()
      await Promise.resolve()
      vi.advanceTimersByTime(100)

      expect(fireCount).toBe(1)

      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })
})
