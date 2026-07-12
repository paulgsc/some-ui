import { describe, expect, it } from "vitest"

import {
  isSelfTagged,
  releaseOwnership,
  selfTagValue,
  tag,
  wasOwned,
  wasRemovedByUs,
  wasRemovedByVendor,
} from "./self-tag"

describe("actuator/self-tag — Definition 7.3", () => {
  it("tag() marks an element self-tagged and owned", () => {
    const el = document.createElement("div")
    tag(el, "k1")

    expect(isSelfTagged(el)).toBe(true)
    expect(selfTagValue(el)).toBe("k1")
    expect(wasOwned(el)).toBe(true)
  })

  it("an untagged element is neither self-tagged nor owned", () => {
    const el = document.createElement("div")
    expect(isSelfTagged(el)).toBe(false)
    expect(wasOwned(el)).toBe(false)
  })

  it("releaseOwnership() clears both markers", () => {
    const el = document.createElement("div")
    tag(el, "k1")
    releaseOwnership(el)

    expect(isSelfTagged(el)).toBe(false)
    expect(wasOwned(el)).toBe(false)
  })
})

describe("actuator/self-tag — ownership signal distinguishes removal source (Remark 7.2)", () => {
  it("a vendor-driven removal is distinguishable: the ownership flag survives because releaseOwnership() was never called", () => {
    const parent = document.createElement("div")
    const el = document.createElement("div")
    parent.appendChild(el)
    document.body.appendChild(parent)

    tag(el, "k1")

    // Simulate a hostile vendor script yanking our node out from under us —
    // no call to releaseOwnership() precedes this.
    el.remove()

    expect(wasRemovedByVendor(el)).toBe(true)
    expect(wasRemovedByUs(el)).toBe(false)

    parent.remove()
  })

  it("our own intentional teardown is distinguishable: releaseOwnership() precedes removal", () => {
    const parent = document.createElement("div")
    const el = document.createElement("div")
    parent.appendChild(el)
    document.body.appendChild(parent)

    tag(el, "k1")
    releaseOwnership(el)
    el.remove()

    expect(wasRemovedByUs(el)).toBe(true)
    expect(wasRemovedByVendor(el)).toBe(false)

    parent.remove()
  })

  it("only the vendor-removal case should trigger a re-assert per Remark 7.2", () => {
    function shouldReassert(el: Element): boolean {
      return wasRemovedByVendor(el)
    }

    const vendorRemoved = document.createElement("div")
    document.body.appendChild(vendorRemoved)
    tag(vendorRemoved, "k1")
    vendorRemoved.remove()

    const ourTeardown = document.createElement("div")
    document.body.appendChild(ourTeardown)
    tag(ourTeardown, "k2")
    releaseOwnership(ourTeardown)
    ourTeardown.remove()

    expect(shouldReassert(vendorRemoved)).toBe(true)
    expect(shouldReassert(ourTeardown)).toBe(false)
  })
})
