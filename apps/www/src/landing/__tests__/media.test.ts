/**
 * What the landing reads of a slot's file when the site is built (C1064): a
 * PNG's size, an MP4's picture size and whether it carries sound. Built here
 * from the boxes themselves, so the readers are held to the layout's own
 * rules rather than to one encoder's output.
 */
import { mp4HasSound, mp4Size, pngSize } from "@/landing/media"
import { describe, expect, it } from "vitest"

const u32 = (n: number): Array<number> => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
]
const text = (s: string): Array<number> => [...s].map((c) => c.charCodeAt(0))

/** One box: its size, its type and its body. */
const box = (type: string, ...body: Array<Array<number>>): Array<number> => {
  const flat = body.flat()
  return [...u32(8 + flat.length), ...text(type), ...flat]
}

/** A tkhd's matrix: the identity, or a quarter turn. */
const IDENTITY = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000]
const QUARTER = [0, 0x10000, 0, -0x10000 >>> 0, 0, 0, 0, 0, 0x40000000]

/** A track of `handler`, its header ending in `width` x `height` (16.16 fixed). */
const trak = (
  handler: string,
  width: number,
  height: number,
  matrix: Array<number> = IDENTITY
): Array<number> =>
  box(
    "trak",
    box(
      "tkhd",
      new Array<number>(40).fill(0),
      matrix.flatMap(u32),
      u32(width * 65536),
      u32(height * 65536)
    ),
    box(
      "mdia",
      box("hdlr", u32(0), u32(0), text(handler), new Array<number>(12).fill(0))
    )
  )

const mp4 = (...tracks: Array<Array<number>>): Uint8Array =>
  new Uint8Array([
    ...box("ftyp", text("isom"), u32(0)),
    ...box("moov", box("mvhd", new Array<number>(100).fill(0)), ...tracks),
    ...box("mdat", [1, 2, 3]),
  ])

describe("mp4Size and mp4HasSound", () => {
  it("read the video track's size, whatever the track order", () => {
    const vertical = mp4(trak("soun", 0, 0), trak("vide", 1080, 1920))
    expect(mp4Size(vertical)).toEqual({ width: 1080, height: 1920 })
    expect(mp4HasSound(vertical)).toBe(true)
  })

  it("read a clip turned a quarter by the shape it shows at", () => {
    const turned = mp4(trak("vide", 1080, 1920, QUARTER))
    expect(mp4Size(turned)).toEqual({ width: 1920, height: 1080 })
  })

  it("find no sound in a clip with only a picture", () => {
    const silent = mp4(trak("vide", 1920, 1080))
    expect(mp4Size(silent)).toEqual({ width: 1920, height: 1080 })
    expect(mp4HasSound(silent)).toBe(false)
  })

  it("read nothing from a file with no picture, or that isn't an MP4", () => {
    expect(mp4Size(mp4(trak("soun", 0, 0)))).toBeNull()
    expect(mp4Size(new Uint8Array([0, 0, 0, 9, 1, 2, 3]))).toBeNull()
    expect(mp4Size(new Uint8Array())).toBeNull()
  })
})

describe("pngSize", () => {
  it("reads the size from the header", () => {
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...u32(13),
      ...text("IHDR"),
      ...u32(800),
      ...u32(600),
    ])
    expect(pngSize(png)).toEqual({ width: 800, height: 600 })
  })

  it("reads nothing from a file that isn't a PNG", () => {
    expect(pngSize(new Uint8Array(32))).toBeNull()
  })
})
