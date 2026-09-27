// @vitest-environment jsdom
/**
 * A change is the card's face for a while: a beat, a rating, a likelihood to
 * finish each take over the card, re-theme it, and hand the face back.
 */

import { DramaCard } from "@drama/components/drama-card"
import { SPOTLIGHT_MS } from "@drama/logic/content/spotlight"
import type { BeatRecord } from "@drama/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CARD_STATE, NO_EVENTS } from "./helpers/fixtures"

let card: DramaCard

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = ""
  const host = document.createElement("div")
  document.body.appendChild(host)
  card = new DramaCard(host, CARD_STATE, NO_EVENTS)
})

afterEach(() => {
  card.destroy()
  vi.useRealTimers()
})

const root = (): HTMLElement => card.root
const face = (): string =>
  root().querySelector(".dc-spotlight")?.textContent ?? ""

const beat = (over: Partial<BeatRecord> = {}): BeatRecord => ({
  id: "b1",
  dramaId: "d1",
  dramaTitle: "Queen of Tears",
  episode: "12",
  mood: "sadness",
  intensity: 1,
  videoTime: 90,
  duration: 3600,
  capturedAt: 0,
  updatedAt: 0,
  ...over,
})

describe("a beat takes over the card", () => {
  it("spotlights the mood and wears its theme", () => {
    card.pushBeat(beat())
    expect(root().dataset.spot).toBe("mood")
    expect(root().dataset.mood).toBe("sadness")
    expect(root().style.getPropertyValue("--dc-hue")).toBe("215")
    expect(face()).toContain("Sad")
  })

  it("hands the face back after the spotlight, keeping the theme", () => {
    card.pushBeat(beat())
    vi.advanceTimersByTime(SPOTLIGHT_MS)
    expect(root().dataset.spot).toBeUndefined()
    expect(root().dataset.mood).toBe("sadness")
  })

  it("restarts the spotlight for a newer change", () => {
    card.pushBeat(beat())
    vi.advanceTimersByTime(SPOTLIGHT_MS - 100)
    card.pushBeat(beat({ intensity: 2 }))
    vi.advanceTimersByTime(200)
    expect(root().dataset.spot).toBe("mood")
    expect(face()).toContain("●●○")
  })

  it("does not spotlight beats loaded from the log", () => {
    card.setBeats("12", [beat({ mood: "joy" })])
    expect(root().dataset.spot).toBeUndefined()
    expect(root().dataset.mood).toBe("joy")
  })
})

describe("the verdict history", () => {
  it("draws the trend and names where the rating started", () => {
    const change = {
      dramaId: "d1",
      dramaTitle: "Queen of Tears",
      field: "rating" as const,
      videoTime: null,
    }
    card.setVerdictLog([
      { ...change, id: "v1", episode: "Ep 1", from: 6, to: 7, at: 0 },
      { ...change, id: "v2", episode: "Ep 4", from: 7, to: 8.5, at: 1 },
    ])
    const path = root().querySelector(".dc-trend-rating")?.getAttribute("d")
    expect(path).toMatch(/^M.* L.* L/)
    expect(root().querySelector(".dc-rating-label")?.textContent).toBe(
      "from 6.0 · Ep 1"
    )
  })
})

describe("a verdict takes over the card", () => {
  it("spotlights a rating change", () => {
    card.update({ rating: CARD_STATE.rating + 0.5 })
    expect(root().dataset.spot).toBe("rating")
    expect(face()).toContain("8.5")
  })

  it("spotlights a likelihood to finish change", () => {
    card.update({ completionLikelihood: 0.3 })
    expect(root().dataset.spot).toBe("finish")
    expect(face()).toContain("Dropping?")
  })

  it("stays quiet when an update changes neither", () => {
    card.update({ timestamp: "12:00" })
    expect(root().dataset.spot).toBeUndefined()
  })

  it("keeps the latest beat's theme over the entry's saved mood", () => {
    card.pushBeat(beat({ mood: "tension" }))
    card.update({ activeMood: "love", rating: 9 })
    expect(root().dataset.mood).toBe("tension")
  })
})
