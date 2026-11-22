/**
 * A long week of the call is a series of parts (#2918, template version 5):
 * every scene of the week in exactly one part, in order, each part at most
 * the shape's `mostMs` by its words, broken at a chapter where it can be and
 * never inside an item, each framed by the locked intro and the brand.
 */

import { sampleWeek } from "@video-render/__tests__/sample-week"
import {
  CALL_MOST,
  callCutList,
  callFormat,
  callParts,
  callScenes,
  CallWeekSchema,
  isFirstPage,
  parseCallWeek,
} from "@video-render/call"
import type { CallScene, CallWeek } from "@video-render/call"
import { readPinned } from "@video-render/node"
import { estimatedMs } from "@video-render/stills"
import { NOV_6_WEEK } from "@video-render/testing"
import { beforeAll, describe, expect, it } from "vitest"

let nov6: CallWeek | null = null

beforeAll(async () => {
  const raw = await readPinned(NOV_6_WEEK)
  if (raw !== null) nov6 = CallWeekSchema.parse(raw)
}, 60_000)

function edited(week: CallWeek, change: (draft: CallWeek) => void): CallWeek {
  const draft = structuredClone<CallWeek>(week)
  change(draft)
  return CallWeekSchema.parse(draft)
}

const at = (week: CallWeek, version: number): CallWeek =>
  edited(week, (w) => {
    w.template.version = version
  })

const FRAMING = new Set(["intro", "brand-in", "brand-out", "chapter"])

/** A part's scenes that carry the week's own words, by id. */
const body = (scenes: ReadonlyArray<CallScene>): Array<string> =>
  scenes.filter((s) => !FRAMING.has(s.section)).map((s) => s.id)

const PARTS = callFormat(5).shape?.parts

describe("a long week in version 5", () => {
  it("is a series, every scene in exactly one part, in order", (context) => {
    if (nov6 === null) return context.skip()
    const week = at(nov6, 5)
    const parts = callParts(week)
    expect(parts.length).toBeGreaterThan(1)
    const whole = body(callParts(at(nov6, 4))[0]?.scenes ?? [])
    expect(parts.flatMap((part) => body(part.scenes))).toEqual(whole)
  })

  it("keeps each part within its most, and opens and closes each on the brand", (context) => {
    if (nov6 === null || PARTS === undefined) return context.skip()
    const parts = callParts(at(nov6, 5))
    for (const part of parts) {
      expect(estimatedMs(part.scenes)).toBeLessThanOrEqual(PARTS.mostMs)
      expect(part.scenes.slice(0, 2).map((s) => s.section)).toEqual([
        "intro",
        "brand-in",
      ])
      expect(part.scenes.at(-1)?.section).toBe("brand-out")
      expect(part.scenes[0]?.said).toContain(
        `part ${String(part.n)} of ${String(part.of)}`
      )
    }
  })

  it("breaks at a chapter, so no item's pages fall in two parts", (context) => {
    if (nov6 === null) return context.skip()
    for (const part of callParts(at(nov6, 5))) {
      const first = part.scenes.find((s) => !FRAMING.has(s.section))
      expect(first !== undefined && isFirstPage(first)).toBe(true)
    }
  })

  it("names its cut list by part", (context) => {
    if (nov6 === null) return context.skip()
    const week = at(nov6, 5)
    const parts = callParts(week)
    const last = parts.length
    expect(callCutList(week, [], { part: last }).title).toBe(
      `The weekly call, 2026-11-06 to 2026-11-13, part ${String(last)} of ${String(last)}`
    )
  })
})

describe("a section longer than a part", () => {
  const long = (): CallWeek =>
    edited(sampleWeek(), (w) => {
      const [batch] = w.done
      if (batch === undefined) throw new Error("done")
      w.done = Array.from({ length: 60 }, (_, i) => ({
        ...batch,
        id: `batch-${String(i)}`,
        said: "These pull requests changed how home keeps its renders, and what the phone shows of them, for the owner. ".repeat(
          2
        ),
        pulls: batch.pulls.map((pull) => ({
          ...pull,
          number: 5000 + i * 10 + pull.number,
        })),
      }))
      w.moved = w.moved.map((epic) => ({ ...epic, landed: [] }))
    })

  it("continues across parts between its items, its chapter said again", () => {
    const parts = callParts(long())
    const withDone = parts.filter((part) =>
      part.scenes.some((s) => s.section === "done")
    )
    expect(withDone.length).toBeGreaterThan(1)
    const slides = withDone.map(
      (part) => part.scenes.find((s) => s.id === "chapter-done")?.said
    )
    expect(slides[0]).toBe("What landed.")
    for (const said of slides.slice(1))
      expect(said).toBe("What landed, continued.")
    const continued = withDone.map(
      (part) =>
        part.scenes.find(
          (s): s is Extract<CallScene, { section: "chapter" }> =>
            s.id === "chapter-done"
        )?.continued === true
    )
    expect(continued).toEqual(withDone.map((_, i) => i > 0))
  })
})

describe("the most a section lists", () => {
  it("is the version's: twelve epics up to version 4, up to 200 from 5", () => {
    const many = (version: number): CallWeek =>
      edited(sampleWeek(), (w) => {
        w.template.version = version
        const [epic] = w.moved
        if (epic === undefined) throw new Error("moved")
        w.moved = Array.from({ length: CALL_MOST.moved + 1 }, (_, i) => ({
          ...epic,
          id: `epic-${String(i)}`,
          landed: [],
        }))
      })
    expect(parseCallWeek(many(4))).toMatchObject({
      ok: false,
      problems: [
        `moved: it lists more than ${String(CALL_MOST.moved)}, the most version 4 draws`,
      ],
    })
    expect(parseCallWeek(many(5))).toMatchObject({ ok: true })
  })
})

describe("a week of one part", () => {
  it("is its scenes, as a week before version 5 is", () => {
    const week = sampleWeek()
    expect(callParts(week)).toHaveLength(1)
    expect(callScenes(week)[0]?.said).not.toContain("part")
  })
})
