/** @vitest-environment node */
import { srtTime, toSrt } from "@captions/lib/srt"
import type { Caption } from "@captions/lib/timing"
import { describe, expect, it } from "vitest"

describe("the subtitle file", () => {
  it("writes times as HH:MM:SS,mmm", () => {
    expect(srtTime(0)).toBe("00:00:00,000")
    expect(srtTime(61_005)).toBe("00:01:01,005")
    expect(srtTime(3_723_456)).toBe("01:02:03,456")
    expect(srtTime(1499.6)).toBe("00:00:01,500")
  })

  it("numbers each caption, gives its times and its lines as said", () => {
    const captions: Array<Caption> = [
      {
        startMs: 400,
        endMs: 2100,
        rows: [
          [
            { text: "Third", startMs: 400, endMs: 600 },
            { text: "and", startMs: 640, endMs: 800 },
          ],
          [{ text: "eleven,", startMs: 840, endMs: 1600 }],
        ],
      },
      {
        startMs: 2100,
        endMs: 3000,
        rows: [[{ text: "Niners", startMs: 2100, endMs: 2500 }]],
      },
    ]
    expect(toSrt(captions)).toBe(
      [
        "1",
        "00:00:00,400 --> 00:00:02,100",
        "Third and",
        "eleven,",
        "",
        "2",
        "00:00:02,100 --> 00:00:03,000",
        "Niners",
        "",
      ].join("\n")
    )
    expect(toSrt([])).toBe("")
  })
})
