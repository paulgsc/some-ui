import {
  commitVisualState,
  disablePrepaint,
  enablePrepaint,
  PREPAINT_VEIL_ID,
  withPrepaintSuppressed,
} from "@filter/lib/content/prepaint"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  veil()?.remove()
  document.documentElement.classList.remove("sw-dirty")
  document.head.querySelectorAll("style").forEach((el) => el.remove())
})

const veil = (): HTMLElement | null => document.getElementById(PREPAINT_VEIL_ID)
const dirty = (): boolean =>
  document.documentElement.classList.contains("sw-dirty")

function requireVeil(): HTMLElement {
  const el = veil()
  if (el === null) throw new Error("veil missing")
  return el
}

/** Every class/childList mutation under <html> while `fn` runs. */
async function mutationsDuring(fn: () => void): Promise<Array<MutationRecord>> {
  const records: Array<MutationRecord> = []
  const observer = new MutationObserver((batch) => records.push(...batch))
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  })
  fn()
  await Promise.resolve()
  observer.disconnect()
  return records
}

function withFakeTimers(fn: () => void): void {
  vi.useFakeTimers()
  try {
    fn()
  } finally {
    vi.useRealTimers()
  }
}

describe("enablePrepaint", () => {
  it("creates the overlay veil element", () => {
    enablePrepaint()
    expect(veil()).not.toBeNull()
    expect(veil()?.tagName).toBe("DIV")
  })

  it("marks the veil [data-my-ext] so the detector/patcher skip it", () => {
    enablePrepaint()
    expect(veil()?.hasAttribute("data-my-ext")).toBe(true)
  })

  it("is idempotent — a second call does not create a duplicate", () => {
    enablePrepaint()
    enablePrepaint()
    expect(document.querySelectorAll(`#${PREPAINT_VEIL_ID}`)).toHaveLength(1)
  })

  it("anchors the veil to documentElement so body mutations cannot remove it", () => {
    enablePrepaint()
    expect(veil()?.parentElement).toBe(document.documentElement)
  })

  it("adds sw-dirty class to html to activate the CSS backstop", () => {
    enablePrepaint()
    expect(dirty()).toBe(true)
  })

  it("writes nothing at all when the veil is already up (#831)", async () => {
    enablePrepaint()
    document.documentElement.classList.add("vendor-a")

    expect(await mutationsDuring(enablePrepaint)).toEqual([])
    document.documentElement.classList.remove("vendor-a")
  })

  it("sw-dirty is added even when a veil element already exists", () => {
    document.documentElement.classList.remove("sw-dirty")
    enablePrepaint() // creates veil
    disablePrepaint() // removes both class and veil
    enablePrepaint() // a re-enable (e.g. SPA navigation)
    expect(dirty()).toBe(true)
  })
})

// ── the veil's rendering regime ──────────────────────────────────────────────
//
// Compensation is skipped in the top layer (see isVeilInTopLayer). jsdom has
// no `:popover-open`, so `matches()` throws and the veil reads as filtered —
// which exercises the compensation path; the top-layer branch stubs `matches`.

describe("veil filter compensation", () => {
  const stubRegime = (el: HTMLElement, inTopLayer: boolean): void => {
    el.matches = (selector: string): boolean =>
      selector === ":popover-open"
        ? inTopLayer
        : Element.prototype.matches.call(el, selector)
  }

  it("counter-inverts against a vendor filter in the filtered regime", () => {
    document.documentElement.style.filter = "invert(1)"
    enablePrepaint()

    expect(veil()?.style.getPropertyValue("background-color")).not.toBe("")

    document.documentElement.style.removeProperty("filter")
  })

  it("does not counter-invert in the top layer — no ancestor filter reaches it", () => {
    document.documentElement.style.filter = "invert(1)"
    enablePrepaint()
    const el = requireVeil()

    // Re-enter promoted: the filtered-regime override must be cleared.
    stubRegime(el, true)
    enablePrepaint()

    expect(el.style.getPropertyValue("background-color")).toBe("")
    document.documentElement.style.removeProperty("filter")
  })

  it("ignores this extension's own legacy filter, which is not a vendor's", () => {
    // detectVendorInvert() cannot tell whose filter it reads; the top-layer
    // check keeps our own legacy invert from being compensated against.
    document.documentElement.setAttribute("data-sw-legacy", "")
    document.documentElement.style.filter =
      "invert(1) hue-rotate(180deg) sepia(0.12) brightness(0.5) contrast(0.92)"
    enablePrepaint()
    const el = requireVeil()

    stubRegime(el, true)
    enablePrepaint()

    expect(el.style.getPropertyValue("background-color")).toBe("")
    document.documentElement.removeAttribute("data-sw-legacy")
    document.documentElement.style.removeProperty("filter")
  })
})

describe("disablePrepaint", () => {
  it("removes the overlay veil", () => {
    enablePrepaint()
    expect(veil()).not.toBeNull()

    disablePrepaint()

    expect(veil()).toBeNull()
  })

  it("removes sw-dirty class from html", () => {
    enablePrepaint()
    expect(dirty()).toBe(true)

    disablePrepaint()

    expect(dirty()).toBe(false)
  })

  it("is a no-op when no veil exists", () => {
    expect(() => disablePrepaint()).not.toThrow()
    expect(veil()).toBeNull()
  })

  it("removes sw-dirty even when no veil element is present", () => {
    document.documentElement.classList.add("sw-dirty")
    disablePrepaint()
    expect(dirty()).toBe(false)
  })

  it("writes nothing at all when the veil is already down (#831)", async () => {
    // `classList.remove` of an absent token still re-sets the class
    // attribute, and the pipeline watches `class`: a phantom change would
    // schedule the next fire, which sends it again.
    document.documentElement.className = "vendor-a vendor-b"

    expect(await mutationsDuring(disablePrepaint)).toEqual([])
    document.documentElement.className = ""
  })
})

describe("commitVisualState", () => {
  it("removes the veil after two rAFs", () => {
    enablePrepaint()
    commitVisualState()
    // vitest.setup.ts stubs rAF synchronous.
    expect(veil()).toBeNull()
  })

  it("schedules nothing when the veil is already down (#831)", () => {
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame")
    try {
      expect(veil()).toBeNull()

      commitVisualState()

      expect(rafSpy).not.toHaveBeenCalled()
    } finally {
      rafSpy.mockRestore()
    }
  })

  it("removes the veil via the timer fallback when rAF never fires", () => {
    // rAF is paused in occluded/background tabs. Spied after faking timers,
    // since fake timers replace rAF too.
    withFakeTimers(() => {
      const rafSpy = vi
        .spyOn(globalThis, "requestAnimationFrame")
        .mockImplementation(() => 0)
      try {
        enablePrepaint()
        commitVisualState()

        expect(veil()).not.toBeNull()

        vi.advanceTimersByTime(200)

        expect(veil()).toBeNull()
      } finally {
        rafSpy.mockRestore()
      }
    })
  })

  it("tears the veil down exactly once — a stale fallback timer is a no-op", () => {
    // Fake rAF fires at ~16ms frames, the fallback at 100ms: advancing 50ms
    // lifts the veil via rAF and leaves the fallback pending.
    withFakeTimers(() => {
      enablePrepaint()
      commitVisualState()

      vi.advanceTimersByTime(50)
      expect(veil()).toBeNull()

      // A fresh veil goes up before the stale fallback fires.
      enablePrepaint()
      vi.advanceTimersByTime(100)

      expect(veil()).not.toBeNull()
    })
  })

  it("a pending commit is invalidated by an intervening enablePrepaint() call", () => {
    // applyTheme("legacy")'s commit cannot be cancelled; a re-arm before its
    // gate fires (nav-start, reengage(), the watchdog's repair) must survive.
    withFakeTimers(() => {
      enablePrepaint()
      commitVisualState()

      enablePrepaint() // a different caller re-arms the veil

      vi.advanceTimersByTime(200) // both the rAF pair and the 100ms fallback

      expect(veil()).not.toBeNull()
      expect(dirty()).toBe(true)
    })
  })

  it("with no intervening enablePrepaint(), the same commit still settles normally (control)", () => {
    withFakeTimers(() => {
      enablePrepaint()
      commitVisualState()

      vi.advanceTimersByTime(200)

      expect(veil()).toBeNull()
    })
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
      veilPresentDuringFn = veil() !== null
    })
    expect(veilPresentDuringFn).toBe(true)
    // and it is still present after — teardown is the caller's job
    expect(veil()).not.toBeNull()
  })
})
