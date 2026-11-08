import { difference, saidOf } from "@video-motion/difference"
import { describe, expect, it } from "vitest"

/** A `width` × `height` RGB frame of one colour. */
const flat = (width: number, height: number, value = 0): Uint8Array =>
  new Uint8Array(width * height * 3).fill(value)

const set = (
  frame: Uint8Array,
  width: number,
  x: number,
  y: number,
  rgb: readonly [number, number, number]
): Uint8Array => {
  frame.set(rgb, (y * width + x) * 3)
  return frame
}

describe("where two drawings of a frame differ (#2739)", () => {
  it("finds no box in the same pixels", () => {
    const d = difference(flat(4, 3, 9), flat(4, 3, 9), 4)
    expect(d).toEqual({ pixels: 0, most: 0, box: null })
    expect(saidOf(7, d)).toBe("frame 7: the same pixels")
  })

  it("boxes every differing pixel, by column and row, with the largest change", () => {
    const a = flat(5, 4)
    const b = set(set(flat(5, 4), 5, 1, 1, [0, 3, 0]), 5, 3, 2, [0, 0, 46])
    const d = difference(a, b, 5)
    expect(d).toEqual({
      pixels: 2,
      most: 46,
      box: { left: 1, top: 1, right: 3, bottom: 2 },
    })
    expect(saidOf(51, d)).toBe("frame 51: 2 pixels in 1,1–3,2, at most 46")
    expect(difference(b, a, 5)).toEqual(d)
  })

  it("refuses frames of different sizes, or not whole rows", () => {
    expect(() => difference(flat(2, 2), flat(2, 3), 2)).toThrow(
      /not the same size/
    )
    expect(() => difference(flat(2, 2), flat(2, 2), 3)).toThrow(
      /not the same size/
    )
  })
})
