// @vitest-environment jsdom
/**
 * The card holds a resource only while it is doing something someone can see
 * (Good-Citizen Charter §7/§8). Asserted with the commons probe rather than
 * trusted: each case drives the card into a state and checks what is still
 * running — intervals, animation frames, page-lifetime listeners, and
 * infinite CSS animations left outside the dormant gate.
 */

import { DramaCard } from "@drama/components/drama-card"
import {
  probeResources,
  ungatedInfiniteAnimations,
} from "@some-extension/common/testing"
import type { ResourceProbe } from "@some-extension/common/testing"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  CARD_STATE,
  CONTENT_CSS,
  DORMANT_GATE,
  nextFrame,
  NO_EVENTS,
} from "./helpers/fixtures"

let probe: ResourceProbe

beforeEach(() => {
  document.body.innerHTML = ""
  // jsdom has no pointer capture; the drag controller calls it on pointerdown.
  HTMLElement.prototype.setPointerCapture = (): void => {}
  probe = probeResources()
})

afterEach(() => probe.restore())

function mount(): DramaCard {
  const host = document.createElement("div")
  document.body.appendChild(host)
  return new DramaCard(host, CARD_STATE, NO_EVENTS)
}

const blossoms = (): Element | null =>
  document.querySelector(".dc-blossom-layer")

describe("the card's resources follow its activity", () => {
  it("runs its timer once entered, and releases everything while minimised", async () => {
    const card = mount()
    await nextFrame()
    expect(probe.counts().intervals).toBe(1)

    card.setSize("min")
    expect(probe.counts()).toMatchObject({ intervals: 0, frames: 0 })
    expect(
      ungatedInfiniteAnimations(document, CONTENT_CSS, DORMANT_GATE)
    ).toEqual([])

    card.setSize("compact")
    expect(probe.counts().intervals).toBe(1)
    card.destroy()
  })

  it("releases everything while hidden (Alt+Shift+D)", async () => {
    const card = mount()
    await nextFrame()

    card.setVisible(false)
    expect(probe.counts()).toMatchObject({ intervals: 0, frames: 0 })
    expect(
      ungatedInfiniteAnimations(document, CONTENT_CSS, DORMANT_GATE)
    ).toEqual([])

    card.setVisible(true)
    expect(probe.counts().intervals).toBe(1)
    card.destroy()
  })

  it("returns every resource when destroyed", async () => {
    const card = mount()
    await nextFrame()
    card.destroy()
    expect(probe.counts()).toEqual(probe.baseline)
    expect(blossoms()).toBeNull()
  })

  it("returns a spotlight's timer and burst when destroyed mid-spotlight", async () => {
    const card = mount()
    await nextFrame()
    card.pushBeat({
      id: "b1",
      dramaId: "d1",
      dramaTitle: "Queen of Tears",
      episode: "12",
      mood: "joy",
      intensity: 3,
      videoTime: null,
      duration: null,
      capturedAt: 0,
      updatedAt: 0,
    })
    card.update({ rating: 9 })
    expect(probe.counts().timeouts).toBeGreaterThan(probe.baseline.timeouts)
    card.destroy()
    expect(probe.counts()).toEqual(probe.baseline)
  })

  it("acquires nothing while entering: destroyed before its first frame", async () => {
    const card = mount()
    card.destroy()
    await nextFrame()
    await nextFrame()
    expect(probe.counts()).toEqual(probe.baseline)
    expect(blossoms()).toBeNull()
  })
})

describe("page listeners live only as long as what needs them", () => {
  it("holds document listeners only for the length of a drag", async () => {
    const card = mount()
    await nextFrame()
    // One for the card's life: the window resize that keeps it on screen.
    const idle = probe.baseline.pageListeners + 1
    expect(probe.counts().pageListeners).toBe(idle)

    const handle = card.root.querySelector(".dc-card")
    handle?.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 })
    )
    expect(probe.counts().pageListeners).toBeGreaterThan(idle)

    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }))
    expect(probe.counts().pageListeners).toBe(idle)
    card.destroy()
  })

  it("leaves none behind however often the card is rebuilt", async () => {
    // content.ts rebuilds the card on every state change.
    for (let i = 0; i < 3; i++) {
      const card = mount()
      await nextFrame()
      card.destroy()
    }
    expect(probe.counts()).toEqual(probe.baseline)
  })
})
