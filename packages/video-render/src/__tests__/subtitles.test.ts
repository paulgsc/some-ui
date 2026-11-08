/**
 * Subtitles (FEED7 #2664): lines break where the speech does and never run
 * past a row, each shows while it is said, and the script lights each word
 * as it is said, drawn in the band at the frame's foot.
 */
import type { TimedWord } from "@video-render/subtitles"
import {
  LINE_CHARS,
  lineCharsFor,
  subtitleBand,
  subtitleLines,
  subtitlesAss,
} from "@video-render/subtitles"
import { describe, expect, it } from "vitest"

/** Words of `text` said one after another, `each` ms apart, from `at`. */
const said = (text: string, at = 0, each = 300): Array<TimedWord> =>
  text.split(" ").map((word, i) => ({
    text: word,
    startMs: at + i * each,
    endMs: at + i * each + each - 50,
  }))

describe("subtitle lines", () => {
  it("break at a sentence's end, at a pause, and before a row would overflow", () => {
    const words = [
      ...said("First, the board. Then what landed", 0),
      ...said("after a pause", 3_000),
      ...said(
        "and a long run of words that keeps going well past what one row of the frame can hold",
        5_000
      ),
    ]
    const lines = subtitleLines(words).map((l) =>
      l.words.map((w) => w.text).join(" ")
    )
    expect(lines[0]).toBe("First, the board.")
    expect(lines[1]).toBe("Then what landed")
    expect(lines[2]).toBe("after a pause")
    expect(lines.slice(3).join(" ")).toBe(
      "and a long run of words that keeps going well past what one row of the frame can hold"
    )
    expect(lines.every((l) => l.length <= LINE_CHARS)).toBe(true)
    expect(lines.length).toBeGreaterThan(4)
  })

  it("each show from its first word to its last, lingering only until the next", () => {
    const lines = subtitleLines([
      ...said("One line.", 0),
      ...said("The next.", 1_000),
    ])
    expect(lines[0]).toMatchObject({ startMs: 0, endMs: 1_000 })
    expect(lines[1]).toMatchObject({ startMs: 1_000, endMs: 2_150 })
    expect(subtitleLines([])).toEqual([])
  })
})

describe("the subtitle script", () => {
  it("lights each word as it is said, in the band at the foot of the frame", () => {
    const ass = subtitlesAss(
      subtitleLines(said("Who answers {between} turns?", 1_000)),
      { width: 1920, height: 1080 },
      "word"
    )
    expect(ass).toContain("PlayResX: 1920")
    expect(ass).toContain("PlayResY: 1080")
    // Bottom-centred (alignment 2), at the band's margin from the foot.
    expect(ass).toMatch(
      new RegExp(`,2,96,96,${subtitleBand(1080).marginPx},1$`, "m")
    )
    expect(ass).toContain(
      "Dialogue: 0,0:00:01.00,0:00:02.75,Said,,0,0,0,,{\\k30}Who {\\k30}answers {\\k30}between {\\k25}turns?"
    )
  })

  it("draws a line whole under `line`", () => {
    const ass = subtitlesAss(
      subtitleLines(said("A plain line.")),
      { width: 1920, height: 1080 },
      "line"
    )
    expect(ass).toContain(",,A plain line.")
    expect(ass).not.toContain("\\k")
  })

  it("leaves a band tall enough for a row and its box", () => {
    for (const band of [subtitleBand(1080), subtitleBand(1920, 1080)])
      expect(band.fontPx * 1.5 + band.marginPx).toBeLessThan(band.bandPx)
  })

  it("keeps a 16:9 frame's line, and shortens a 9:16 frame's to fit across it", () => {
    expect(lineCharsFor({ width: 1920, height: 1080 })).toBe(LINE_CHARS)
    expect(subtitleBand(1080)).toEqual(subtitleBand(1080, 1920))
    const short = { width: 1080, height: 1920 }
    const band = subtitleBand(short.height, short.width)
    const chars = lineCharsFor(short)
    expect(chars).toBeLessThan(LINE_CHARS)
    // Each character no wider than six tenths of the size fits between the sides.
    expect(chars * band.fontPx * 0.6).toBeLessThanOrEqual(
      short.width - 2 * band.sidePx
    )
    const words = said(
      "Across the conference the floor rose from seven to eight and the north holds it"
    )
    for (const line of subtitleLines(words, chars))
      expect(
        line.words.map((w) => w.text).join(" ").length
      ).toBeLessThanOrEqual(chars)
  })
})
