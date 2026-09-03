import { createOcclusionHold } from "@filter/adapter/custody-primitive"
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
})
