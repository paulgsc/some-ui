/** @vitest-environment node */
import type { PlacedBurnIn } from "@burn-ins/lib/clash"
import { clashes } from "@burn-ins/lib/clash"
import { GAME_CARD_SAMPLES, SAMPLES } from "@burn-ins/lib/samples"
import { describe, expect, it } from "vitest"

const FPS = 30

/** The samples' six seconds, at 30 fps. */
const WHOLE = { startFrame: 0, frames: 180 }

const placed = (
  kind: PlacedBurnIn["kind"],
  design: string,
  params: unknown,
  at: { startFrame: number; frames: number }
): PlacedBurnIn => ({ kind, design, params, ...at })

const headline = (at: { startFrame: number; frames: number }): PlacedBurnIn =>
  placed("headline", "v1", SAMPLES.headline, at)
const card = (at: { startFrame: number; frames: number }): PlacedBurnIn =>
  placed("card", "v1", SAMPLES.card, at)
const mark = placed("authorship", "cells-v1", SAMPLES.authorship, WHOLE)

describe("two burn-ins in one place", () => {
  it("refuses a scene's headline and card together, naming where", () => {
    const at = { startFrame: 60, frames: 30 }
    expect(clashes([headline(at), card(at)], FPS)).toEqual([
      "the headline burn-in (v1) and the card burn-in (v1) both draw in the header at 2.00 s",
    ])
  })

  it("refuses a game card over a card, in the body", () => {
    const at = { startFrame: 0, frames: 30 }
    const game = placed("game-card", "gridiron-v1", GAME_CARD_SAMPLES.stat, at)
    expect(clashes([card(at), game], FPS).join()).toMatch(
      /both draw in the body/
    )
  })

  it("lets a headline follow a card, one scene after the other", () => {
    expect(
      clashes(
        [
          card({ startFrame: 0, frames: 60 }),
          headline({ startFrame: 60, frames: 60 }),
        ],
        FPS
      )
    ).toEqual([])
  })

  it("reads the authorship mark where it is at each moment", () => {
    // Between its intro and its end card the mark keeps to the gutter.
    expect(
      clashes([mark, headline({ startFrame: 60, frames: 60 })], FPS)
    ).toEqual([])
    // Its intro holds the header.
    expect(
      clashes([mark, headline({ startFrame: 0, frames: 30 })], FPS).join()
    ).toMatch(/both draw in the header/)
  })

  it("leaves a burn-in that can't be drawn to the recorder's load", () => {
    const at = { startFrame: 0, frames: 30 }
    expect(clashes([placed("headline", "v1", {}, at), card(at)], FPS)).toEqual(
      []
    )
  })
})
