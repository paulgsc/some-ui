import { parseCutList } from "@video-render/cut-list"
import type { Composition } from "@video-render/cut-list"
import { cutList, shot } from "@video-render/testing"
import { describe, expect, it } from "vitest"

const still = (source: string): ReturnType<typeof shot> =>
  shot("S1", { picture: { kind: "still", source } })

describe("parseCutList", () => {
  it.each([
    "../outside.png",
    "/abs/x.png",
    "file:/abs/x.png",
    "http://host/x.png",
    "concat:a.png|b.png",
    "-h",
    "a/../../x.png",
  ])("refuses %s as a file", (source) => {
    const parsed = parseCutList(cutList([still(source)]))
    expect(parsed.ok ? [] : parsed.problems).toContain(
      "shots.0.picture.source: names a file inside the video's folder"
    )
  })

  it("refuses times that run backwards", () => {
    const parsed = parseCutList(
      cutList([
        shot("S1", {
          overrides: {
            motion: { kind: "punch-in", at: [800, 200], amount: 0.2 },
          },
        }),
      ])
    )
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      "shots.0.overrides.motion.at: punch-in times move forward",
    ])
  })

  it("names every reason a scene can't be rendered, each once", () => {
    const parsed = parseCutList(
      cutList([
        shot("S1", {
          take: { file: "voice/01.webm", inMs: 0, outMs: 2500 },
          overrides: { transitionIn: "wipe" },
        }),
        shot("S1", {
          overrides: { motion: { kind: "freeze", atMs: 9000 } },
        }),
        shot("S3", {
          picture: { kind: "card" },
          overrides: { motion: { kind: "push-in", amount: 0.1 } },
        }),
      ])
    )
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      "S1: the take runs past the scene's end",
      "S1: the first scene has nothing to come in from",
      "S1: two scenes share this id",
      "S1: a motion time is past the scene's end",
      "S3: a card has no picture to move",
    ])
  })

  it("lets a composition draw its own picture and its own way in and out (HYPER2)", () => {
    const composed: Composition = {
      kind: "composition",
      ref: "promo-hook",
      variables: { title: "Hi" },
      files: ["walk/01.png"],
    }
    const parsed = parseCutList(
      cutList([
        shot("S1", { picture: { kind: "card" } }),
        shot("S2", {
          picture: composed,
          overrides: {
            transitionIn: "crossfade",
            motion: { kind: "push-in", amount: 0.1 },
          },
        }),
        shot("S3", { overrides: { transitionIn: "wipe" } }),
      ])
    )
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      "S2: a composition draws its own picture",
      "S2: a composition draws its own way in",
      "S3: the composition before it draws its own way out",
    ])
  })

  it("takes captions over the whole video, once, with nothing written for them (SFEED11)", () => {
    const captions = { kind: "captions", params: {} }
    expect(
      parseCutList(cutList([shot("S1")], { burnIns: [captions] })).ok
    ).toBe(true)
    const parsed = parseCutList(
      cutList([shot("S1", { burnIns: [captions] })], {
        burnIns: [
          captions,
          { kind: "captions", params: { lines: [{ words: [] }] } },
        ],
      })
    )
    expect(parsed.ok ? [] : parsed.problems).toEqual([
      "S1: the captions burn-in covers the whole video",
      "the captions burn-in is drawn once",
      "the captions burn-in is drawn from each take's words; nothing is written for it",
    ])
  })
})
