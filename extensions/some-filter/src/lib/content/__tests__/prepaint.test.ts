import {
  commitVisualState,
  disablePrepaint,
  enablePrepaint,
  PREPAINT_VEIL_ID,
  withPrepaintSuppressed,
} from "@filter/lib/content/prepaint"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  document.getElementById(PREPAINT_VEIL_ID)?.remove()
  document.documentElement.classList.remove("sw-dirty")
  document.head.querySelectorAll("style").forEach((el) => el.remove())
})

describe("enablePrepaint", () => {
  it("creates the overlay veil element", () => {
    enablePrepaint()
    const veil = document.getElementById(PREPAINT_VEIL_ID)
    expect(veil).not.toBeNull()
    expect(veil?.tagName).toBe("DIV")
  })

  it("marks the veil [data-my-ext] so the detector/patcher skip it", () => {
    enablePrepaint()
    const veil = document.getElementById(PREPAINT_VEIL_ID)
    expect(veil?.hasAttribute("data-my-ext")).toBe(true)
  })

  it("is idempotent — a second call does not create a duplicate", () => {
    enablePrepaint()
    enablePrepaint()
    expect(document.querySelectorAll(`#${PREPAINT_VEIL_ID}`)).toHaveLength(1)
  })

  it("anchors the veil to documentElement so body mutations cannot remove it", () => {
    enablePrepaint()
    const veil = document.getElementById(PREPAINT_VEIL_ID)
    expect(veil?.parentElement).toBe(document.documentElement)
  })

  it("adds sw-dirty class to html to activate the CSS backstop", () => {
    enablePrepaint()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)
  })

  it("writes nothing at all when the veil is already up (#831)", async () => {
    enablePrepaint()
    document.documentElement.classList.add("vendor-a")
    const records: Array<MutationRecord> = []
    const observer = new MutationObserver((batch) => records.push(...batch))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    })

    enablePrepaint()
    await Promise.resolve()

    expect(records).toEqual([])
    observer.disconnect()
    document.documentElement.classList.remove("vendor-a")
  })

  it("sw-dirty is added even when a veil element already exists", () => {
    document.documentElement.classList.remove("sw-dirty")
    enablePrepaint() // creates veil
    disablePrepaint() // removes both class and veil
    // Simulate a re-enable (e.g. SPA navigation)
    enablePrepaint()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)
  })
})

describe("disablePrepaint", () => {
  it("removes the overlay veil", () => {
    enablePrepaint()
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()

    disablePrepaint()

    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })

  it("removes sw-dirty class from html", () => {
    enablePrepaint()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(true)

    disablePrepaint()

    expect(document.documentElement.classList.contains("sw-dirty")).toBe(false)
  })

  it("is a no-op when no veil exists", () => {
    expect(() => disablePrepaint()).not.toThrow()
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })

  it("removes sw-dirty even when no veil element is present", () => {
    document.documentElement.classList.add("sw-dirty")
    disablePrepaint()
    expect(document.documentElement.classList.contains("sw-dirty")).toBe(false)
  })

  it("writes nothing at all when the veil is already down (#831)", async () => {
    // `classList.remove` of an *absent* token still re-serializes and re-sets
    // the class attribute whenever the element has one — which every real
    // page's <html> does — and a same-value setAttribute still queues a
    // MutationRecord. The pipeline watches `class`, so an unguarded no-op
    // here is a phantom "the page changed" signal; because content.ts calls
    // commitVisualState() -> disablePrepaint() on every fire, that signal
    // schedules the next fire, which sends it again. "No veil to remove"
    // must therefore mean "no DOM writes", not just "no visible change".
    document.documentElement.className = "vendor-a vendor-b"
    const records: Array<MutationRecord> = []
    const observer = new MutationObserver((batch) => records.push(...batch))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    })

    disablePrepaint()
    await Promise.resolve()

    expect(records).toEqual([])
    observer.disconnect()
    document.documentElement.className = ""
  })
})

describe("commitVisualState", () => {
  it("removes the veil after two rAFs", () => {
    enablePrepaint()
    commitVisualState()
    // vitest.setup.ts stubs rAF to execute synchronously,
    // so both nested rAFs fire immediately.
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })

  it("schedules nothing when the veil is already down (#831)", () => {
    // Called on every pipeline fire, not just the first. Once there is no
    // veil left to commit, the rAF pair and the fallback timer would only
    // queue work whose sole effect is another disablePrepaint().
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame")
    try {
      expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()

      commitVisualState()

      expect(rafSpy).not.toHaveBeenCalled()
    } finally {
      rafSpy.mockRestore()
    }
  })

  it("removes the veil via the timer fallback when rAF never fires", () => {
    // rAF is paused in occluded/background tabs. Simulate that by making it a
    // no-op so only the setTimeout fallback can lift the veil.
    vi.useFakeTimers()
    const rafSpy = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(() => 0)
    try {
      enablePrepaint()
      commitVisualState()

      // rAF stubbed out — the veil is still up until the timer fires.
      expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()

      vi.advanceTimersByTime(200)

      expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
    } finally {
      rafSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("tears the veil down exactly once — a stale fallback timer is a no-op", () => {
    // Under fake timers rAF is modeled as firing at ~16ms frames while the
    // fallback timer is at 100ms, so advancing 50ms fires the rAF pair (which
    // lifts the veil) but leaves the fallback timer still pending. The
    // `dropped` guard must keep that stale timer from tearing down a *later*
    // veil once it eventually fires.
    vi.useFakeTimers()
    try {
      enablePrepaint()
      commitVisualState()

      vi.advanceTimersByTime(50)
      // rAF pair has lifted the veil; the 100ms fallback is still pending.
      expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()

      // A fresh veil goes up before the stale fallback fires.
      enablePrepaint()
      vi.advanceTimersByTime(100)

      // The stale timer's drop() was guarded — the new veil survives.
      expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("withPrepaintSuppressed", () => {
  it("returns the value produced by fn", () => {
    expect(withPrepaintSuppressed(() => 42)).toBe(42)
  })

  it("returns the object produced by fn (referential equality)", () => {
    const obj = { alreadyDark: true }
    expect(withPrepaintSuppressed(() => obj)).toBe(obj)
  })

  it("injects a transition-freeze style while fn runs", () => {
    let styleCountDuringFn = 0
    withPrepaintSuppressed(() => {
      styleCountDuringFn = document.head.querySelectorAll("style").length
    })
    expect(styleCountDuringFn).toBe(1)
  })

  it("the freeze style is marked [data-my-ext]", () => {
    let marked = false
    withPrepaintSuppressed(() => {
      const style = document.head.querySelector("style")
      marked = style?.hasAttribute("data-my-ext") ?? false
    })
    expect(marked).toBe(true)
  })

  it("removes the transition-freeze style after fn returns", () => {
    withPrepaintSuppressed(() => {})
    expect(document.head.querySelectorAll("style")).toHaveLength(0)
  })

  it("removes the freeze style even when fn throws", () => {
    try {
      withPrepaintSuppressed(() => {
        throw new Error("boom")
      })
    } catch {
      // expected
    }
    expect(document.head.querySelectorAll("style")).toHaveLength(0)
  })

  it("propagates exceptions from fn", () => {
    expect(() =>
      withPrepaintSuppressed(() => {
        throw new Error("test error")
      })
    ).toThrow("test error")
  })

  it("does not touch the veil — vendor styles are read with the veil up", () => {
    enablePrepaint()
    let veilPresentDuringFn = false
    withPrepaintSuppressed(() => {
      veilPresentDuringFn = document.getElementById(PREPAINT_VEIL_ID) !== null
    })
    expect(veilPresentDuringFn).toBe(true)
    // and it is still present after — teardown is the caller's job
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()
  })
})
