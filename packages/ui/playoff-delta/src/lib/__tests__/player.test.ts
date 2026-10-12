import {
  initialPlayer,
  step,
  type PlayerEvent,
} from "@playoff-delta/lib/player"
import { describe, expect, it } from "vitest"

const next: PlayerEvent = { type: "next", count: 3 }

describe("the player", () => {
  it("clamps navigation to the story", () => {
    const s = initialPlayer(3)
    expect(step(s, { type: "back" }).slide).toBe(0)
    expect(step(step(step(s, next), next), next).slide).toBe(2)
    expect(initialPlayer(3, 9).slide).toBe(2)
  })

  it("advances on a hold only for the slide it was set for", () => {
    const playing = step(initialPlayer(3), { type: "toggle", count: 3 })
    const elapsed: PlayerEvent = { type: "elapsed", slide: 0, count: 3 }
    expect(step(playing, elapsed).slide).toBe(1)
    expect(step(step(playing, next), elapsed).slide).toBe(1)
  })

  it("stops at the end, and playing again starts over", () => {
    const playing = step(initialPlayer(2), { type: "toggle", count: 2 })
    const onLast = step(playing, { type: "elapsed", slide: 0, count: 2 })
    const ended = step(onLast, { type: "elapsed", slide: 1, count: 2 })
    expect(ended).toMatchObject({ playing: false, slide: 1 })
    expect(step(ended, { type: "toggle", count: 2 })).toMatchObject({
      playing: true,
      slide: 0,
    })
  })
})
