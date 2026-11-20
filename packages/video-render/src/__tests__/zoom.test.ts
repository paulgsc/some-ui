import {
  ESSAY_ZOOM_FOOT,
  essayCutList,
  essayScenes,
  essayZoomRefs,
  sampleEssay,
} from "@video-render/essay"
import type { Essay } from "@video-render/essay"
import { parseScreens, SCREENS_SCHEMA } from "@video-render/screen"
import type { Screens } from "@video-render/screen"
import { SCREEN_ZOOM, ZOOM_STOPS_MOST, zoomPicture } from "@video-render/zoom"
import { describe, expect, it } from "vitest"

const box = (
  y: number
): { x: number; y: number; width: number; height: number } => ({
  x: 16,
  y,
  width: 380,
  height: 40,
})

/** A card of `ticket`, with the regions named, each a box further down. */
const card = (ticket: string, names: ReadonlyArray<string>): unknown => ({
  id: ticket,
  file: `${ticket}.png`,
  width: 412,
  height: 1400,
  scale: 2,
  viewport: { width: 412, height: 915 },
  regions: names.map((name, i) => ({
    ref: `${ticket}:${name}`,
    box: box(20 + i * 50),
  })),
})

const screensOf = (cards: ReadonlyArray<unknown>): Screens => {
  const parsed = parseScreens({ schema: SCREENS_SCHEMA, screens: cards })
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

const essay = (): Essay => {
  const parsed = sampleEssay()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

describe("a screen zoomed to its parts (RR31)", () => {
  const screens = screensOf([
    card("QM-311", ["question", "program", "diagnostic:1"]),
    card("QM-312", ["question"]),
  ])

  it("is the screen-zoom composition, its stops in the order asked, its picture copied in", () => {
    const picture = zoomPicture(
      screens,
      ["QM-311:program", "QM-311:question", "QM-311:point:1"],
      { foot: 0.25, theme: "mochi-night" }
    )
    expect(picture).toEqual({
      kind: "composition",
      ref: SCREEN_ZOOM,
      variables: {
        picture: "screens/QM-311.png",
        width: 412,
        height: 1400,
        scale: 2,
        // The point the card doesn't hold is left out.
        stops: JSON.stringify([box(70), box(20)]),
        foot: 0.25,
        theme: "mochi-night",
      },
      files: ["screens/QM-311.png"],
    })
  })

  it("refuses a foot past half the frame", () => {
    expect(() =>
      zoomPicture(screens, ["QM-311:question"], { foot: 0.6 })
    ).toThrow(/foot/)
    expect(() =>
      zoomPicture(screens, ["QM-311:question"], { foot: -0.1 })
    ).toThrow(/foot/)
  })

  it("is nothing when no region asked for was captured", () => {
    expect(zoomPicture(screens, ["QM-313:question"])).toBeNull()
    expect(zoomPicture(screens, [])).toBeNull()
  })

  it("refuses two screens in one scene, and more stops than a scene holds", () => {
    expect(() =>
      zoomPicture(screens, ["QM-311:question", "QM-312:question"])
    ).toThrow(/one screen/)
    const many = Array.from(
      { length: ZOOM_STOPS_MOST + 1 },
      (_, i) => `point:${String(i + 1)}`
    )
    const crowded = screensOf([card("QM-311", many)])
    expect(() =>
      zoomPicture(
        crowded,
        many.map((name) => `QM-311:${name}`)
      )
    ).toThrow(/at most/)
  })
})

describe("the Rust essay's scenes on the phone's own card (RR31)", () => {
  it("zooms a question scene to the question, each point, the program and rustc's first diagnostics", () => {
    const sample = essay()
    const question = essayScenes(sample).find(
      (scene) => scene.section === "question"
    )
    const ticket = sample.tickets[0]
    if (question === undefined || ticket === undefined)
      throw new Error("the sample has a question")
    expect(essayZoomRefs(sample, question)).toEqual([
      `${ticket.id}:question`,
      ...ticket.points.map((_, j) => `${ticket.id}:point:${String(j + 1)}`),
      `${ticket.id}:program`,
      `${ticket.id}:diagnostic:1`,
      `${ticket.id}:diagnostic:2`,
    ])
  })

  it("leaves every other scene its still", () => {
    const sample = essay()
    for (const scene of essayScenes(sample))
      if (scene.section !== "question")
        expect(essayZoomRefs(sample, scene)).toEqual([])
  })

  it("draws each question scene as its card, zoomed, only once the week's cards were photographed", () => {
    const sample = essay()
    const takes = essayScenes(sample).map(() => null)
    const plain = essayCutList(sample, takes)
    const cards = screensOf(
      sample.tickets.map((ticket) =>
        card(ticket.id, ["question", "point:1", "program"])
      )
    )
    const zoomed = essayCutList(sample, takes, { screens: cards })
    expect(zoomed.shots.map((shot) => shot.durationMs)).toEqual(
      plain.shots.map((shot) => shot.durationMs)
    )
    zoomed.shots.forEach((shot, i) => {
      const before = plain.shots[i]
      if (shot.id.startsWith("question-")) {
        expect(shot.picture.kind).toBe("composition")
        if (shot.picture.kind !== "composition") return
        expect(shot.picture.ref).toBe(SCREEN_ZOOM)
        expect(shot.picture.variables["foot"]).toBe(ESSAY_ZOOM_FOOT)
        expect(shot.overrides).toEqual({})
      } else expect(shot).toEqual(before)
    })
    expect(
      plain.shots.filter((shot) => shot.picture.kind === "composition").length
    ).toBe(2) // the brand's open and close
  })
})
