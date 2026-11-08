/** @vitest-environment node */
import type { PlacedBurnIn } from "@burn-ins/lib/clash"
import { clashes } from "@burn-ins/lib/clash"
import { FRAMES, PORTRAIT, type FrameSize } from "@burn-ins/lib/geometry"
import { CardParamsSchema } from "@burn-ins/lib/journal"
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

/** The sample card; in the 16:9 video's shorter body, without its note, which doesn't fit there. */
const cardFor = (frame: FrameSize): unknown =>
  frame === PORTRAIT
    ? SAMPLES.card
    : { ...CardParamsSchema.parse(SAMPLES.card), note: "" }

describe.each(
  FRAMES.map((frame) => ({ frame, name: `${frame.width}x${frame.height}` }))
)("two burn-ins in one place in $name", ({ frame }) => {
  const headline = (at: { startFrame: number; frames: number }): PlacedBurnIn =>
    placed("headline", "v1", SAMPLES.headline, at)
  const card = (at: { startFrame: number; frames: number }): PlacedBurnIn =>
    placed("card", "v1", cardFor(frame), at)
  const mark = placed("authorship", "cells-v1", SAMPLES.authorship, WHOLE)

  it("refuses a scene's headline and card together, naming where", () => {
    const at = { startFrame: 60, frames: 30 }
    expect(clashes([headline(at), card(at)], FPS, frame)).toEqual([
      "the headline burn-in (v1) and the card burn-in (v1) both draw in the header at 2.00 s",
    ])
  })

  it("refuses a game card over a card, in the body", () => {
    const at = { startFrame: 0, frames: 30 }
    const game = placed("game-card", "gridiron-v1", GAME_CARD_SAMPLES.stat, at)
    expect(clashes([card(at), game], FPS, frame).join()).toMatch(
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
        FPS,
        frame
      )
    ).toEqual([])
  })

  it("reads the authorship mark where it is at each moment", () => {
    // Between its intro and its end card the mark keeps to the gutter.
    expect(
      clashes([mark, headline({ startFrame: 60, frames: 60 })], FPS, frame)
    ).toEqual([])
    // Its intro holds the header.
    expect(
      clashes(
        [mark, headline({ startFrame: 0, frames: 30 })],
        FPS,
        frame
      ).join()
    ).toMatch(/both draw in the header/)
  })

  it("lets captions run under a card, in the lower third", () => {
    const captions = placed("captions", "gridiron", SAMPLES.captions, WHOLE)
    expect(clashes([captions, card(WHOLE)], FPS, frame)).toEqual([])
  })

  it("leaves a burn-in that can't be drawn to the recorder's load", () => {
    const at = { startFrame: 0, frames: 30 }
    expect(
      clashes([placed("headline", "v1", {}, at), card(at)], FPS, frame)
    ).toEqual([])
  })
})

describe("a frame burn-ins aren't drawn for", () => {
  it("is left to the recorder's load, which names it", () => {
    const at = { startFrame: 0, frames: 30 }
    expect(
      clashes(
        [
          placed("headline", "v1", SAMPLES.headline, at),
          placed("card", "v1", SAMPLES.card, at),
        ],
        FPS,
        { width: 1280, height: 720 }
      )
    ).toEqual([])
  })
})
