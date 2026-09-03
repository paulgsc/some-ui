import {
  createOcclusionHold,
  VEIL_STYLE,
} from "@filter/adapter/custody-primitive"
import { afterEach, describe, expect, it } from "vitest"

const HOLD_SELECTOR = "[data-scope-registry-hold]"

/** Lets a jsdom MutationObserver's microtask-queued callback run. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  document.documentElement
    .querySelectorAll(HOLD_SELECTOR)
    .forEach((el) => el.remove())
})

describe("createOcclusionHold — document scope", () => {
  it("install() synchronously appends a fixed, full-viewport, top-stacked occlusion under documentElement", () => {
    const hold = createOcclusionHold(document)
    hold.install()

    const veil = document.documentElement.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    const style = veil?.getAttribute("style") ?? ""
    // position:fixed's containing block is the viewport regardless of DOM
    // nesting — this, plus the maximal z-index, is what makes the hold
    // boundary-crossing (Definition D.5) within the ordinary stacking-context
    // tree: it covers every live descendant of the scope, registered or not,
    // not just the scope's own direct content. See this module's own header
    // comment for the full argument, including the known top-layer exception
    // (tracked by the epic's SF-LG, #1269 — not this story's to close); the
    // live-browser proof is tests/e2e/specs/scope-registry-handoff.spec.ts.
    expect(style).toContain("position:fixed")
    expect(style).toContain("inset:0")
    expect(style).toContain("z-index:2147483647")
    // SF-DC (#1267): a per-scope reactive observer (shadow-scope-discovery.ts)
    // must be able to tell this veil's own install()/self-heal churn apart
    // from vendor evidence (Axiom 3.5) — the same ownership tag
    // prepaint.ts's own veil already carries.
    expect(veil?.getAttribute("data-my-ext")).toBe("")

    hold.release()
  })

  it("install() is idempotent while already engaged", () => {
    const hold = createOcclusionHold(document)
    hold.install()
    const first = document.documentElement.querySelector(HOLD_SELECTOR)
    hold.install()
    const veils = document.documentElement.querySelectorAll(HOLD_SELECTOR)

    expect(veils).toHaveLength(1)
    expect(veils[0]).toBe(first)

    hold.release()
  })

  it("release() removes the veil and stops self-healing", async () => {
    const hold = createOcclusionHold(document)
    hold.install()
    hold.release()

    expect(document.documentElement.querySelector(HOLD_SELECTOR)).toBeNull()

    // Manually re-inserting a same-attribute node after release() must not
    // be "healed" away or otherwise interfered with — the observer was
    // disconnected.
    const decoy = document.createElement("div")
    decoy.setAttribute("data-scope-registry-hold", "")
    document.documentElement.appendChild(decoy)
    await flushMicrotasks()
    expect(document.documentElement.contains(decoy)).toBe(true)
    decoy.remove()
  })

  it("release() is idempotent when never installed", () => {
    const hold = createOcclusionHold(document)
    expect(() => hold.release()).not.toThrow()
  })

  it("self-heals: reinserts the veil after adversarial removal", async () => {
    const hold = createOcclusionHold(document)
    hold.install()
    const veil = document.documentElement.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()

    veil?.remove()
    expect(document.documentElement.querySelector(HOLD_SELECTOR)).toBeNull()

    await flushMicrotasks()

    expect(document.documentElement.querySelector(HOLD_SELECTOR)).not.toBeNull()

    hold.release()
  })

  it("self-heals: restores the veil's own style after a page disables it in place, without removing it (bot-found, #1267's review)", async () => {
    // A page locating the veil by its own public data-my-ext/HOLD_ATTR
    // marker and disabling it in place (style.display = "none", or
    // clearing the style attribute outright) never removes it from the
    // DOM, so the removal-only self-heal above never fires — this is a
    // separate repair path.
    const hold = createOcclusionHold(document)
    hold.install()
    const veil = document.documentElement.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    if (veil === null) return
    const originalStyle = veil.getAttribute("style")

    veil.setAttribute("style", "display:none;")
    expect(veil.getAttribute("style")).not.toBe(originalStyle)

    await flushMicrotasks()

    expect(veil.getAttribute("style")).toBe(originalStyle)
    // Still connected — never removed, just restored in place.
    expect(document.documentElement.contains(veil)).toBe(true)

    hold.release()
  })

  it("self-heals: restores the veil to its mount when reparented into a different still-connected element (bot-found, #1267's review, round 5)", async () => {
    // A page moving the veil into a display:none wrapper (or any other
    // still-connected element) rather than removing it outright leaves
    // `Node.isConnected` true throughout — the old removal-only check
    // (`!veil.isConnected`) never fired for this. `parentNode !== mount` is
    // the check that catches both cases uniformly.
    const hold = createOcclusionHold(document)
    hold.install()
    const veil = document.documentElement.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    if (veil === null) return

    const wrapper = document.createElement("div")
    wrapper.style.display = "none"
    document.documentElement.appendChild(wrapper)
    wrapper.appendChild(veil)

    expect(veil.isConnected).toBe(true)
    expect(veil.parentElement).toBe(wrapper)

    await flushMicrotasks()

    expect(veil.parentElement).toBe(document.documentElement)
    expect(wrapper.contains(veil)).toBe(false)

    hold.release()
    wrapper.remove()
  })
})

describe("createOcclusionHold — shadow-root scope", () => {
  it("mounts the occlusion inside the shadow root itself, and self-heals there", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const hold = createOcclusionHold(shadow)
    hold.install()

    const veil = shadow.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    // Never leaks into the host's own light-DOM tree.
    expect(host.querySelector(HOLD_SELECTOR)).toBeNull()

    veil?.remove()
    await flushMicrotasks()
    expect(shadow.querySelector(HOLD_SELECTOR)).not.toBeNull()

    hold.release()
    expect(shadow.querySelector(HOLD_SELECTOR)).toBeNull()
    host.remove()
  })

  it("self-heals the veil's own style there too, without removing it", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const hold = createOcclusionHold(shadow)
    hold.install()
    const veil = shadow.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    if (veil === null) return
    const originalStyle = veil.getAttribute("style")

    veil.setAttribute("style", "background-color:transparent;")
    await flushMicrotasks()

    expect(veil.getAttribute("style")).toBe(originalStyle)
    expect(shadow.contains(veil)).toBe(true)

    hold.release()
    host.remove()
  })
})

describe("createOcclusionHold — isOwnNode (bot-found, #1267's own review, round 6)", () => {
  it("recognises the veil by identity even after its own HOLD_ATTR/data-my-ext markers are stripped", () => {
    const hold = createOcclusionHold(document)
    hold.install()
    const veil = document.documentElement.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    if (veil === null) return

    veil.removeAttribute("data-scope-registry-hold")
    veil.removeAttribute("data-my-ext")

    expect(hold.isOwnNode(veil)).toBe(true)

    hold.release()
  })

  it("recognises a since-release()d veil by identity — release() nulls the live reference synchronously, before any reactive callback observing the removal gets a chance to run", () => {
    const hold = createOcclusionHold(document)
    hold.install()
    const veil = document.documentElement.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    if (veil === null) return

    hold.release()

    // The exact regression this story's own test suite caught: an
    // implementation comparing against the hold's mutable `veil` variable
    // (nulled by release() above) would return false here, right when a
    // caller reacting to release()'s own removal record needs it most.
    expect(hold.isOwnNode(veil)).toBe(true)
  })

  it("does not recognise an unrelated node, markers or not", () => {
    const hold = createOcclusionHold(document)
    hold.install()

    const decoy = document.createElement("div")
    decoy.setAttribute("data-scope-registry-hold", "")
    decoy.setAttribute("data-my-ext", "")

    expect(hold.isOwnNode(decoy)).toBe(false)

    hold.release()
  })
})

describe("VEIL_STYLE — !important against author-origin CSS (bot-found, #1267's own review, rounds 6-8)", () => {
  // Rounds 6-8 are one recurring finding, not three distinct ones: round 6
  // added !important to every property VEIL_STYLE already had, without
  // adding `display` itself, so the round's own cited `display: none
  // !important` example was never actually defended (round 7 caught the
  // gap in the fix). Round 8 found the same shape again with `filter`. Two
  // rounds finding "one more property" is why VEIL_STYLE's own doc comment
  // now says plainly there is no finite property list that closes this
  // class of gap — mask/clip-path/mix-blend-mode/backdrop-filter/
  // content-visibility and any future property with a similar effect are
  // all still open to the identical attack, for the identical reason (this
  // veil lives inside the same shadow tree whose own stylesheet can select
  // it). The test below is deliberately self-verifying against the actual
  // constant, not a hand-maintained mirror list, so it cannot silently
  // drift the way the round-6 property list did — a property added to
  // VEIL_STYLE without !important fails this test on its own, with no
  // separate list to remember to update.
  it("every declaration in VEIL_STYLE itself carries !important", () => {
    const declarations = VEIL_STYLE.split(";")
      .map((d) => d.trim())
      .filter((d) => d.length > 0)
    expect(declarations.length).toBeGreaterThan(0)
    for (const declaration of declarations) {
      expect(declaration, `${declaration} is missing !important`).toMatch(
        /!important$/
      )
    }
  })

  it("declares every property in the 'make this invisible, collapse it, or move it' set this review has concretely found so far", () => {
    // A named-list check, kept deliberately separate from the
    // self-verifying test above: that test catches a property losing
    // !important, this one catches a property being dropped from
    // VEIL_STYLE entirely.
    for (const property of [
      "position",
      "inset",
      "z-index",
      "margin",
      "padding",
      "width",
      "height",
      "display",
      "visibility",
      "opacity",
      "filter",
      "transform",
      "background-color",
      "pointer-events",
    ]) {
      expect(VEIL_STYLE, `missing declaration for ${property}`).toContain(
        `${property}:`
      )
    }
  })

  it("applied to a real veil, defeats the exact author rule each of rounds 6-8 cited", () => {
    const hold = createOcclusionHold(document)
    hold.install()
    const veil = document.documentElement.querySelector(HOLD_SELECTOR)
    expect(veil).not.toBeNull()
    if (veil === null) return

    expect(veil.getAttribute("style")).toBe(VEIL_STYLE)

    hold.release()
  })
})
