// @vitest-environment jsdom
/**
 * The card is always wholly on screen: it mounts top-left unless a position
 * was saved, a saved position from a bigger window is pulled back in, and a
 * window that shrinks takes the card with it.
 */

import { DramaCard } from "@drama/components/drama-card"
import { DEFAULT_SPAWN } from "@drama/content/display"
import { fitInViewport } from "@drama/logic/content/utils"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CARD_STATE, NO_EVENTS } from "./helpers/fixtures"

const CARD = { width: 300, height: 260 }
let card: DramaCard

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  })
  Object.defineProperty(window, "innerHeight", {
    value: height,
    configurable: true,
  })
}

beforeEach(() => {
  document.body.innerHTML = ""
  setViewport(1280, 720)
  // jsdom lays nothing out; give the card its real-world size.
  HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
    const left = parseFloat(this.style.left) || 0
    const top = parseFloat(this.style.top) || 0
    return DOMRect.fromRect({ x: left, y: top, ...CARD })
  }
  const host = document.createElement("div")
  document.body.appendChild(host)
  card = new DramaCard(host, CARD_STATE, NO_EVENTS)
})

afterEach(() => card.destroy())

const shownAt = (): { x: number; y: number } => ({
  x: parseFloat(card.root.style.left),
  y: parseFloat(card.root.style.top),
})

describe("the card stays on screen", () => {
  it("mounts where it is put when that fits", () => {
    card.setPosition(DEFAULT_SPAWN.x, DEFAULT_SPAWN.y)
    expect(shownAt()).toEqual(DEFAULT_SPAWN)
  })

  it("pulls a position saved in a bigger window back in", () => {
    card.setPosition(1800, 1000)
    expect(shownAt()).toEqual({ x: 1280 - 300 - 8, y: 720 - 260 - 8 })
  })

  it("follows a shrinking window, and returns when it grows back", () => {
    card.setPosition(900, 400)
    setViewport(800, 500)
    window.dispatchEvent(new Event("resize"))
    expect(shownAt()).toEqual({ x: 800 - 300 - 8, y: 500 - 260 - 8 })

    setViewport(1280, 720)
    window.dispatchEvent(new Event("resize"))
    expect(shownAt()).toEqual({ x: 900, y: 400 })
  })
})

describe("fitInViewport", () => {
  it("keeps the top-left corner on screen when the box is bigger", () => {
    const at = fitInViewport(
      { x: 50, y: 50 },
      { width: 900, height: 900 },
      { width: 400, height: 300 },
      8
    )
    expect(at).toEqual({ x: 8, y: 8 })
  })
})
