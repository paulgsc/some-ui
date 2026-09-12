import {
  createContentSession,
  isSelfAuthored,
  scan,
  scanCanvas,
  withVendorColorsVisible,
} from "@filter/adapter/pipeline"
import { SWATCHES } from "@filter/adapter/swatches"
import { PREPAINT_DIRTY_CLASS } from "@filter/lib/content/prepaint"
import { DARK_THEME_ATTR } from "@filter/lib/content/theme-apply"
import { createSessionLifecycle } from "@some-extension/transport/session/lifecycle"
import { afterEach, describe, expect, it, vi } from "vitest"

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
  document.documentElement.style.backgroundColor = ""
  document.body.style.backgroundColor = ""
  document.documentElement.classList.remove(PREPAINT_DIRTY_CLASS)
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

  it("marks a display:none descendant's evidence as unrendered", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23); display: none"></div>'
    const { attrsByKey } = scan(document.body)
    const attr = attrsByKey.get("rgb(13, 17, 23)")
    expect(attr?.rendered).toBe(false)
  })

  it("marks a visibility:hidden descendant's evidence as unrendered", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23); visibility: hidden"></div>'
    const { attrsByKey } = scan(document.body)
    const attr = attrsByKey.get("rgb(13, 17, 23)")
    expect(attr?.rendered).toBe(false)
  })

  it("marks an ordinary visible descendant's evidence as rendered", () => {
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23)"></div>'
    const { attrsByKey } = scan(document.body)
    const attr = attrsByKey.get("rgb(13, 17, 23)")
    expect(attr?.rendered).toBe(true)
  })

  it("reports a shared key as rendered when a later occurrence is visible, even though the first occurrence (the one whose attr is stored) is hidden", () => {
    // scan() only ever stores the *first* carrier's SurfaceAttr for a given
    // key (surfaceKeyFor's own docstring already documents this collapse
    // for text/imageOnly); rendered must not inherit that same "first
    // wins" behavior, or a key with any hidden first occurrence would be
    // wrongly dropped from the page-level mean even when a later, visible
    // occurrence of the identical color exists elsewhere on the page.
    document.body.innerHTML =
      '<div id="hidden-first" style="background-color: rgb(13, 17, 23); display: none"></div>' +
      '<div id="visible-second" style="background-color: rgb(13, 17, 23)"></div>'
    const { attrsByKey } = scan(document.body)
    const attr = attrsByKey.get("rgb(13, 17, 23)")
    expect(attr?.rendered).toBe(true)
  })

  it("reports a shared key as unrendered only when every occurrence is hidden", () => {
    document.body.innerHTML =
      '<div style="background-color: rgb(13, 17, 23); display: none"></div>' +
      '<div style="background-color: rgb(13, 17, 23); visibility: hidden"></div>'
    const { attrsByKey } = scan(document.body)
    const attr = attrsByKey.get("rgb(13, 17, 23)")
    expect(attr?.rendered).toBe(false)
  })
})

describe("scan — shadow DOM boundary, unchanged by SF-DC (#1262 Gate 0, G0.1)", () => {
  // G0.1 proved scan()'s TreeWalker never crosses a shadow boundary (a
  // shadow root is spec-defined to be a distinct node tree from its host's),
  // which is the structural fact SF-DC (#1267) closes at the *scope* level —
  // shadow-scope-discovery.ts registers and holds a discovered root, so it
  // can no longer paint natively uncovered. What SF-DC deliberately does not
  // do is fold shadow-internal evidence into scan()'s own elementsByKey/
  // attrsByKey: "Out of scope: Actually theming discovered scopes (SF-AD,
  // next)" and "No theme-specific logic in this module — [discovery] does
  // not decide colors" (#1267's own acceptance criteria). This assertion
  // therefore still holds after SF-DC, unchanged from before it — the
  // boundary scan() itself observes is the same one; only custody around it
  // changed. A future SF-AD projecting the real adapter into a committed
  // shadow scope is expected to be the story that finally flips this.
  it("produces zero elementsByKey/attrsByKey entries for a surface inside an open shadow root, while an identical light-DOM sibling produces one", () => {
    document.body.innerHTML =
      '<div id="light-sibling" style="background-color: rgb(255, 255, 255)"></div>' +
      '<div id="shadow-host"></div>'

    const host = document.getElementById("shadow-host")
    expect(host).not.toBeNull()
    if (host === null) return
    const root = host.attachShadow({ mode: "open" })
    const shadowSurface = document.createElement("div")
    shadowSurface.id = "shadow-surface"
    shadowSurface.style.backgroundColor = "rgb(255, 255, 255)"
    root.appendChild(shadowSurface)

    const { elementsByKey, attrsByKey } = scan(document.body)

    const key = "rgb(255, 255, 255)"
    expect(elementsByKey.get(key)?.map((el) => el.id)).toEqual([
      "light-sibling",
    ])
    for (const elements of elementsByKey.values()) {
      expect(elements).not.toContain(shadowSurface)
    }
    expect(elementsByKey.get(key)?.length).toBe(1)
    expect(attrsByKey.size).toBe(1)
  })
})

describe("scan — direct children of a ShadowRoot inherit from the host, not from nothing (bot-found, SF-AD's own review, round 4)", () => {
  // SF-AD (#1268) is the first caller to scope scan() directly to a
  // ShadowRoot (shadow-scope-theming.ts's own projectOnce()). A direct
  // child of that root has no el.parentElement — its real parent is the
  // ShadowRoot itself, a DocumentFragment, not an Element — which every
  // element scan() ever walked before this story (always somewhere inside
  // document.body, where an Element parent is guaranteed) never hit.
  // ownTextColor()'s `parent ?? ...` fallback used to treat a null
  // parentElement as "no ancestor to compare against" and discard the
  // element's own color outright, even when it was genuinely explicit.
  it("keeps a direct shadow-root child's own explicit text color, compared against the shadow host's computed color", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.style.color = "rgb(0, 0, 0)"
    const root = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.setAttribute(
      "style",
      "background-color: rgb(255, 255, 255); color: rgb(17, 17, 17)"
    )
    root.appendChild(surface)

    const { attrsByKey } = scan(root)

    const key = "rgb(255, 255, 255)|text:rgb(17, 17, 17)"
    const attr = attrsByKey.get(key)
    expect(attr).toBeDefined()
    expect(attr?.text).toEqual([17 / 255, 17 / 255, 17 / 255, 1])
  })

  it("reports no own text color for a direct shadow-root child whose color merely inherits the host's (the flat-tree's own inheritance path, not a difference to act on)", () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    host.style.color = "rgb(0, 0, 0)"
    const root = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.setAttribute("style", "background-color: rgb(255, 255, 255)")
    root.appendChild(surface)

    const { attrsByKey } = scan(root)

    const attr = attrsByKey.get("rgb(255, 255, 255)")
    expect(attr).toBeDefined()
    expect(attr?.text).toBeNull()
  })
})

describe("scanCanvas — root/canvas evidence for the false-dark-verdict veto", () => {
  it("reads html's own explicit background as canvas evidence, not assumed-bright", () => {
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"

    const canvas = scanCanvas(document.body)

    expect(canvas.size).toBe(1)
    for (const attr of canvas.values()) {
      expect(attr.evidenceRole).toBe("canvas")
      expect(attr.luminance).toBeLessThan(0.1)
    }
  })

  it("resolves html's canvas color from body when html declares nothing of its own (CSS canvas propagation)", () => {
    // https://www.w3.org/TR/css-backgrounds-3/#special-backgrounds: with no
    // background on html, body's declared background paints the whole
    // canvas. Reading html/body as two independent carriers would read
    // html's own transparent background as assumed-bright and veto
    // restore-native on this extremely common native-dark pattern.
    document.body.style.backgroundColor = "rgb(13, 17, 23)"

    const canvas = scanCanvas(document.body)

    expect(canvas.size).toBe(1)
    for (const attr of canvas.values()) {
      expect(attr.evidenceRole).toBe("canvas")
      expect(attr.luminance).toBeLessThan(0.1)
    }
  })

  it("treats html/body with no explicit background as assumed-bright canvas evidence", () => {
    // The exact YouTube shape: nothing in the light-DOM stack declares a
    // color, so the browser's own white default is the true visible
    // substrate — indistinguishable, from a computed-style read alone, from
    // "no evidence at all." Must not be read as the latter.
    const canvas = scanCanvas(document.body)

    expect(canvas.size).toBe(1)
    for (const attr of canvas.values()) {
      expect(attr.evidenceRole).toBe("canvas")
      expect(attr.luminance).toBe(1)
      expect(attr.rendered).toBe(true)
    }
  })

  it("omits html canvas evidence entirely while sw-dirty's CSS backstop would contaminate the body-fallback read", () => {
    // prepaint.css's `html.sw-dirty > body { background: ... !important }`
    // beats any plain (non-!important) vendor body rule in a real browser
    // (confirmed separately against a real cascade, not reproduced here —
    // this test only needs bodyCanvasBackstopActive()'s own precondition:
    // sw-dirty present, html declaring nothing of its own). The fallback
    // must not report body's read at all in that state, since it cannot
    // tell this extension's own forced color from the vendor's.
    document.body.style.backgroundColor = "rgb(255, 255, 255)"
    document.documentElement.classList.add(PREPAINT_DIRTY_CLASS)

    const canvas = scanCanvas(document.body)

    expect(canvas.has("__canvas__:html")).toBe(false)
    expect(canvas.size).toBe(0)
  })

  it("still reads html's own explicit background while sw-dirty is active — the backstop only targets body", () => {
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"
    document.documentElement.classList.add(PREPAINT_DIRTY_CLASS)

    const canvas = scanCanvas(document.body)

    expect(canvas.size).toBe(1)
    const attr = canvas.get("__canvas__:html")
    expect(attr?.luminance).toBeLessThan(0.1)
  })

  it("does not add canvas keys to a descendant scan's own elementsByKey/attrsByKey", () => {
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.innerHTML =
      '<div style="background-color: rgb(255, 255, 255)"></div>'

    const { elementsByKey, attrsByKey } = scan(document.body)

    expect(elementsByKey.size).toBe(1)
    expect(attrsByKey.size).toBe(1)
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

  it("a genuinely dark page (mean luminance low, dark canvas) restores native instead of tagging, immediately", () => {
    // Three distinct dark keys, at/above theme-adapter.ts's
    // MIN_EVIDENCE_FOR_DARK_VERDICT -- a single evidenced element is exactly
    // the sparse-sample case that guard exists to distrust. html/body also
    // carry their own explicit dark background: this is what real-world
    // native-dark pages do to avoid their own FOUC, and it's what makes
    // "already dark" trustworthy here -- scanCanvas()'s bright-canvas veto
    // (the false-dark-verdict fix) means dark surface evidence alone, with
    // html/body left transparent, is no longer enough (see the sibling test
    // below, which is exactly that shape and must NOT restore native).
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23)"></div>' +
      '<div id="b" style="background-color: rgb(5, 5, 5)"></div>' +
      '<div id="c" style="background-color: rgb(10, 10, 10)"></div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)
    const target = document.getElementById("a")
    expect(target?.dataset.swPatched).toBeUndefined()

    contentSession.teardown()
  })

  it("does NOT restore native from dark descendants alone when html/body are left transparent (the YouTube false-dark verdict)", () => {
    // The exact failure the recon traced: a fully transparent light-DOM
    // stack (ytd-app after hydration, with nothing beneath it declaring a
    // color either) leaves the browser's own white canvas as the true
    // visible substrate, while enough small/hidden dark descendant keys
    // exist to pull scan()'s distinct-key mean below the dark threshold.
    // html/body here are never given an explicit background -- exactly
    // that shape -- so scanCanvas() must read them as assumed-bright
    // (unknown) and veto restore-native, even though the three descendant
    // keys alone would have crossed MIN_EVIDENCE_FOR_DARK_VERDICT and read
    // dark under the old, canvas-blind verdict.
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23)"></div>' +
      '<div id="b" style="background-color: rgb(5, 5, 5)"></div>' +
      '<div id="c" style="background-color: rgb(10, 10, 10)"></div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)

    contentSession.teardown()
  })

  it("does NOT restore native when dark descendants sit under a hidden canvas reading (unknown, not proof of dark)", () => {
    // html declares nothing of its own, so its effective canvas color
    // propagates from body (CSS's canvas background propagation) -- but
    // body itself is visibility:hidden here, so that propagated dark
    // reading can't actually be seen either. An "unrendered" canvas
    // reading must not be trusted as proof the page is dark -- it is
    // exactly as uninformative as no color at all.
    document.body.style.cssText =
      "background-color: rgb(13, 17, 23); visibility: hidden"
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23); visibility: visible"></div>' +
      '<div id="b" style="background-color: rgb(5, 5, 5); visibility: visible"></div>' +
      '<div id="c" style="background-color: rgb(10, 10, 10); visibility: visible"></div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)

    contentSession.teardown()
    document.body.style.visibility = ""
  })

  it("resolves html's effective canvas color from body when html declares no background of its own (CSS canvas propagation)", () => {
    // The extremely common native-dark pattern: only body declares a dark
    // background, html is left untouched. Reading html and body as two
    // independently-transparent carriers would misclassify this as an
    // unknown/bright canvas and veto restore-native on every such page.
    document.body.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.innerHTML =
      '<div id="a" style="background-color: rgb(13, 17, 23)"></div>' +
      '<div id="b" style="background-color: rgb(5, 5, 5)"></div>' +
      '<div id="c" style="background-color: rgb(10, 10, 10)"></div>'
    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)

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

describe("createContentSession — Axiom 3.5: actuation is not evidence (#831)", () => {
  it("quiesces after a settled round instead of re-triggering itself forever", async () => {
    // The reported symptom: a steadily incrementing log line on a page that
    // is not changing. Realizing a verdict writes to the DOM (the theme
    // stylesheet into <head>, the dynamic sheet's text, the veil's ownership
    // class), the observer sees those writes, schedules another round, and
    // that round realizes the same verdict again — a closed loop with no
    // vendor mutation anywhere in it. Once settled, an untouched page must
    // cost exactly zero further cycles.
    vi.useFakeTimers()
    try {
      document.body.innerHTML =
        '<div id="a" style="background-color: rgb(255, 255, 255)"></div>' +
        '<div id="b" style="background-color: rgb(240, 240, 240)"></div>'
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
      contentSession.rescan()

      expect(fireCount).toBe(1)

      // Let the observer deliver whatever the round's own writes produced,
      // then run the clock well past several debounce windows. Nothing in
      // the page changed, so nothing more may fire.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve()
        await Promise.resolve()
        vi.advanceTimersByTime(200)
      }

      expect(fireCount).toBe(1)

      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("ignores mutations authored by the extension itself", async () => {
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

      // An extension-owned stylesheet landing in <head> is a childList
      // mutation under documentElement — the attributeFilter never covered
      // it, which is how injecting the theme re-triggered the scan that
      // injected it.
      const own = document.createElement("style")
      own.setAttribute("data-my-ext", "")
      own.textContent = "body{}"
      document.head.appendChild(own)

      // The veil's ownership signal is the one extension write that lands on
      // a vendor node, so it can only be recognised by what changed.
      document.documentElement.classList.add("sw-dirty")
      document.documentElement.classList.remove("sw-dirty")

      await Promise.resolve()
      await Promise.resolve()
      vi.advanceTimersByTime(200)

      expect(fireCount).toBe(0)

      own.remove()
      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("still reacts to a vendor class change on <html>", async () => {
    // The `sw-dirty` filter must be keyed on the veil's own token, not on
    // "class changes on <html> are boring" — vendors drive real theming off
    // exactly that attribute.
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

      document.documentElement.classList.add("vendor-dark")

      await Promise.resolve()
      await Promise.resolve()
      vi.advanceTimersByTime(200)

      expect(fireCount).toBe(1)

      document.documentElement.classList.remove("vendor-dark")
      contentSession.teardown()
    } finally {
      vi.useRealTimers()
    }
  })

  it("senses once per coalesced round, not once per raw mutation batch", async () => {
    // The compute half of the report: sensing used to run on the raw
    // mutation callback while only decide/realize was debounced, so the
    // Sensor's cost (a full tree walk plus a getComputedStyle per node)
    // scaled with the vendor's churn rate and all but the last result was
    // thrown away. Definition 7.2 says a burst costs one round.
    vi.useFakeTimers()
    const walkSpy = vi.spyOn(document, "createTreeWalker")
    try {
      document.body.innerHTML = '<div id="a"></div>'
      const session = createSessionLifecycle()
      const contentSession = createContentSession(SWATCHES.default, session)

      const target = document.getElementById("a")
      expect(target).not.toBeNull()
      if (target === null) return

      contentSession.observe()
      walkSpy.mockClear()

      for (let i = 0; i < 10; i++) {
        target.style.backgroundColor = `rgb(${i}, ${i}, ${i})`
      }
      await Promise.resolve()
      await Promise.resolve()
      vi.advanceTimersByTime(200)

      // Two walks per round, not one per mutation: scan()'s own vendor-
      // evidence walk, plus SF-RC1 (#1340)'s independent legibility-audit
      // walk that runs after decide()/realize() settle within the same
      // round (this fixture's empty Ĥ still gets activate-theme --
      // theme-adapter.ts's decide() emits it unconditionally whenever a
      // swatch is selected and the page doesn't read as already dark --
      // so the audit's own activate-theme gate is satisfied every round).
      // The coalescing claim this test exists to prove is exactly the
      // same either way: one round, not ten.
      expect(walkSpy).toHaveBeenCalledTimes(2)

      contentSession.teardown()
    } finally {
      walkSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})

describe("isSelfAuthored", () => {
  function recordsFrom(
    mutate: () => void,
    init: MutationObserverInit
  ): Promise<ReadonlyArray<MutationRecord>> {
    return new Promise((resolve) => {
      const observer = new MutationObserver((batch) => {
        observer.disconnect()
        resolve(batch)
      })
      observer.observe(document.documentElement, init)
      mutate()
    })
  }

  it("recognises a stylesheet this extension inserted into <head>", async () => {
    const own = document.createElement("style")
    own.setAttribute("data-my-ext", "")

    const records = await recordsFrom(() => document.head.appendChild(own), {
      childList: true,
      subtree: true,
    })

    expect(records.length).toBeGreaterThan(0)
    expect(records.every(isSelfAuthored)).toBe(true)
    own.remove()
  })

  it("does not recognise a vendor node inserted into the page", async () => {
    const vendor = document.createElement("div")

    const records = await recordsFrom(() => document.body.appendChild(vendor), {
      childList: true,
      subtree: true,
    })

    expect(records.some((record) => !isSelfAuthored(record))).toBe(true)
    vendor.remove()
  })

  it("does not recognise the removal of an extension-owned node (Remark 7.2)", async () => {
    // "Our node is gone" is ambiguous between our own teardown and a hostile
    // page stripping [data-my-ext] out from under us. Reading it as our own
    // would mean never repairing the second case — the swatch-oracle's
    // extensionDomRemoval primitive is exactly that scenario.
    const own = document.createElement("style")
    own.setAttribute("data-my-ext", "")
    document.head.appendChild(own)

    const records = await recordsFrom(() => own.remove(), {
      childList: true,
      subtree: true,
    })

    expect(records.some((record) => !isSelfAuthored(record))).toBe(true)
  })

  it("recognises the veil's sw-dirty toggle alongside unrelated vendor classes", async () => {
    document.documentElement.className = "vendor-a vendor-b"

    const records = await recordsFrom(
      () => document.documentElement.classList.add("sw-dirty"),
      { attributes: true, attributeFilter: ["class"], attributeOldValue: true }
    )

    expect(records.every(isSelfAuthored)).toBe(true)
    document.documentElement.className = ""
  })

  it("does not recognise a vendor class change that happens to also carry sw-dirty", async () => {
    document.documentElement.className = "sw-dirty"

    const records = await recordsFrom(
      () => document.documentElement.classList.add("vendor-dark"),
      { attributes: true, attributeFilter: ["class"], attributeOldValue: true }
    )

    expect(records.some((record) => !isSelfAuthored(record))).toBe(true)
    document.documentElement.className = ""
  })
})

describe("withVendorColorsVisible — evidence is vendor truth, not our own output", () => {
  function ownSheet(id: string): HTMLStyleElement {
    const style = document.createElement("style")
    style.id = id
    style.setAttribute("data-my-ext", "")
    style.textContent = "body{background-color:rgb(13,17,23)}"
    document.head.appendChild(style)
    return style
  }

  it("disables the extension's own color sheets for the duration of the scan", () => {
    const stat = ownSheet(STYLE_ID)
    const dynamic = ownSheet(DYNAMIC_STYLE_ID)

    const seen = withVendorColorsVisible(() => [
      stat.sheet?.disabled,
      dynamic.sheet?.disabled,
    ])

    expect(seen).toEqual([true, true])
    expect(stat.sheet?.disabled).toBe(false)
    expect(dynamic.sheet?.disabled).toBe(false)

    stat.remove()
    dynamic.remove()
  })

  it("re-enables them even when the scan throws", () => {
    const stat = ownSheet(STYLE_ID)

    expect(() =>
      withVendorColorsVisible(() => {
        throw new Error("scan blew up")
      })
    ).toThrow("scan blew up")

    expect(stat.sheet?.disabled).toBe(false)

    stat.remove()
  })

  it("leaves a vendor stylesheet alone", () => {
    const vendor = document.createElement("style")
    vendor.id = "vendor-sheet"
    vendor.textContent = "body{background-color:rgb(255,255,255)}"
    document.head.appendChild(vendor)

    // jsdom leaves `disabled` unset until something assigns it, so compare
    // against the truthy state the suppression actually sets, not `false`.
    const seen = withVendorColorsVisible(() => vendor.sheet?.disabled === true)

    expect(seen).toBe(false)
    vendor.remove()
  })
})

describe("createContentSession — evidence is scoped to the content epoch", () => {
  it("drops the previous route's evidence after a content reset (Theorem D.1(a))", () => {
    // Ĥ never forgets a key, and epoch dominance only settles keys that
    // *recur*. Without an explicit drop, colors from a route the user has
    // already navigated away from keep voting in the page-level verdict —
    // enough of them, and a light page inherits the previous page's "already
    // dark" conclusion and never gets themed. html/body carry an explicit
    // dark canvas for the first route too — scanCanvas()'s bright-canvas
    // veto means the descendant mean alone (with html/body transparent) is
    // no longer sufficient for "already dark," so the drop this test is
    // actually about needs a real dark verdict to have fired in the first
    // place for the second assertion to be meaningful.
    document.documentElement.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.style.backgroundColor = "rgb(13, 17, 23)"
    document.body.innerHTML =
      '<div style="background-color: rgb(13, 17, 23)"></div>' +
      '<div style="background-color: rgb(5, 5, 5)"></div>' +
      '<div style="background-color: rgb(10, 10, 10)"></div>' +
      '<div style="background-color: rgb(20, 20, 20)"></div>'

    const session = createSessionLifecycle()
    const contentSession = createContentSession(SWATCHES.default, session)

    contentSession.rescan()
    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(false)

    // Same-document navigation to a light route: the new route's own
    // html/body canvas replaces the previous route's dark one, same as a
    // real vendor SPA swapping its own root styling on navigation.
    document.documentElement.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.style.backgroundColor = "rgb(255, 255, 255)"
    document.body.innerHTML =
      '<div style="background-color: rgb(180, 180, 180)"></div>' +
      '<div style="background-color: rgb(185, 185, 185)"></div>' +
      '<div style="background-color: rgb(190, 190, 190)"></div>'
    session.resetContent()

    contentSession.rescan()

    expect(document.documentElement.hasAttribute(DARK_THEME_ATTR)).toBe(true)

    contentSession.teardown()
  })
})
