import { parseCutList } from "@video-render/cut-list"
import sample from "@video-render/sample/build-journal-short.json"
import { parseSeries } from "@video-render/series"
import { describe, expect, it } from "vitest"

import { cutList, shot } from "./fixtures"

describe("parseCutList", () => {
  it("reads a cut list and fills its defaults", () => {
    const raw = JSON.parse(
      JSON.stringify(
        cutList([
          shot("S1", { take: { file: "voice/01.webm", inMs: 0, outMs: 1500 } }),
        ])
      )
    )
    delete raw.shots[0].voiceInMs
    delete raw.notes
    const parsed = parseCutList(raw)
    expect(parsed.ok && parsed.value.shots[0]?.voiceInMs).toBe(200)
    expect(parsed.ok && parsed.value.notes).toEqual([])
  })

  it("names every reason a cut list can't be rendered", () => {
    const parsed = parseCutList(
      cutList([
        shot("S1", { take: { file: "voice/01.webm", inMs: 0, outMs: 2500 } }),
        shot("S1", {
          overrides: { motion: { kind: "freeze", atMs: 9000 } },
        }),
        shot("S3", {
          picture: { kind: "still", source: "../outside.png" },
        }),
      ])
    )
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      "shots.2.picture.source: a path inside the video's folder",
    ])
    const valid = parseCutList(
      cutList([
        shot("S1", { take: { file: "voice/01.webm", inMs: 0, outMs: 2500 } }),
        shot("S1", { overrides: { motion: { kind: "freeze", atMs: 9000 } } }),
      ])
    )
    expect(valid.ok ? [] : valid.problems).toEqual([
      "S1: the take runs past the scene's end",
      "S1: two scenes share this id",
      "S1: a motion time is past the scene's end",
    ])
  })
})

describe("the sample series", () => {
  it("is a series", () => {
    const parsed = parseSeries(sample)
    expect(parsed.ok ? parsed.value.id : parsed.problems).toBe(
      "build-journal-short"
    )
  })

  it("refuses a window outside the frame", () => {
    const parsed = parseSeries({
      ...sample,
      window: { x: 54, y: 250, width: 1080, height: 1450 },
    })
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      "window: the window fits inside the frame",
    ])
  })
})
