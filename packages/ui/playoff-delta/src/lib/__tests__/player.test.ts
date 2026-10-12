import { initialPlayer, step } from "@playoff-delta/lib/player"
import { describe, expect, it } from "vitest"

describe("the player", () => {
  it("clamps navigation to the story", () => {
    const s = initialPlayer(3)
    expect(step(s, { type: "back" }).slide).toBe(0)
    expect(
      step(step(step(s, { type: "next" }), { type: "next" }), { type: "next" })
        .slide
    ).toBe(2)
    expect(initialPlayer(3, 9).slide).toBe(2)
  })

  it("advances on a hold only for the slide it was set for", () => {
    const playing = step(initialPlayer(3), { type: "toggle" })
    expect(step(playing, { type: "elapsed", slide: 0 }).slide).toBe(1)
    // A stale timer for a slide already left does nothing.
    expect(
      step(step(playing, { type: "next" }), { type: "elapsed", slide: 0 }).slide
    ).toBe(1)
  })

  it("stops at the end, and playing again starts over", () => {
    const playing = step(initialPlayer(2), { type: "toggle" })
    const onLast = step(playing, { type: "elapsed", slide: 0 })
    const ended = step(onLast, { type: "elapsed", slide: 1 })
    expect(ended).toMatchObject({ playing: false, slide: 1 })
    expect(step(ended, { type: "toggle" })).toMatchObject({
      playing: true,
      slide: 0,
    })
  })
})
