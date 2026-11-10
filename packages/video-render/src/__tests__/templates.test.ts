/**
 * The templates Studio lists (SFEED1): one per folder under `templates/`
 * that pins a format, each its newest pinned version, so a version pinned
 * and not listed fails here; and each one's storyboard (SFEED3), pinned
 * beside it, is drawn in that version.
 */
import { readdirSync } from "node:fs"
import { join } from "node:path"
import {
  callScenes,
  callStoryboard,
  estimatedCallMs,
  sampleCallWeek,
} from "@video-render/call"
import { essayScenes, essayStoryboard, sampleEssay } from "@video-render/essay"
import { readFormat, readSeries, TEMPLATES_DIR } from "@video-render/node"
import { framesInTime, parseStoryboard } from "@video-render/storyboard"
import {
  isTemplateId,
  TEMPLATE_IDS,
  TEMPLATE_SERIES,
  templateCaptions,
  templateFormat,
  templateStoryboard,
} from "@video-render/templates"
import { describe, expect, it } from "vitest"

describe("the templates Studio lists", () => {
  it("are every folder that pins a format, each its newest version", async () => {
    const pinned: Array<string> = []
    for (const id of readdirSync(TEMPLATES_DIR).sort()) {
      const newest = await readFormat(join(TEMPLATES_DIR, id))
      if (!newest.ok) continue
      pinned.push(id)
      if (!isTemplateId(id)) continue
      expect(templateFormat(id)).toEqual(newest.value)
    }
    expect(pinned).toEqual([...TEMPLATE_IDS].sort())
  })
})

describe("the look each template is captioned in", () => {
  it("is the one its series' newest version names, in its frame", async () => {
    for (const id of TEMPLATE_IDS) {
      const newest = await readSeries(
        join(import.meta.dirname, "../sample/series", TEMPLATE_SERIES[id])
      )
      if (!newest.ok) throw new Error(newest.problems.join("; "))
      expect(templateCaptions(id)).toEqual({
        look: newest.value.designs.captions ?? null,
        frame: {
          width: newest.value.frame.width,
          height: newest.value.frame.height,
        },
      })
    }
  })
})

describe("a template's storyboard", () => {
  it.each(TEMPLATE_IDS)("%s: drawn in its newest version", (id) => {
    const format = templateFormat(id)
    const board = templateStoryboard(id)
    expect(board.template).toEqual({ id, version: format.version })
    const sections = board.frames.filter((f) => f.kind === "section")
    expect(sections.length).toBeGreaterThan(0)
    expect(board.frames[0]?.kind).toBe(format.shape ? "intro" : "section")
  })

  it("the call's is its sample week, a frame per scene it says", () => {
    const week = sampleCallWeek()
    if (!week.ok) throw new Error(week.problems.join("; "))
    const board = templateStoryboard("conference-call")
    // The pin is the code's; the phone reads the pin, since it can't carry call.ts.
    expect(board).toEqual(callStoryboard())
    expect(parseStoryboard(board).ok).toBe(true)
    // Each frame holds as long as the episode's scene would, with no take.
    expect(framesInTime(board).ms).toBe(estimatedCallMs(week.value))
    expect(board.frames.map((f) => f.id)).toEqual(
      callScenes(week.value).map((s) => s.id)
    )
    const asks = board.frames.filter((f) => f.id.startsWith("asks-"))
    expect(asks.map((f) => f.item)).toEqual(
      week.value.asks.map((_, i) => i + 1)
    )
  })
})

describe("the essay's storyboard", () => {
  it("is its sample essay, a frame per scene, voiced as the sample", () => {
    const essay = sampleEssay()
    if (!essay.ok) throw new Error(essay.problems.join("; "))
    const board = templateStoryboard("rust-essay")
    expect(board).toEqual(essayStoryboard())
    expect(parseStoryboard(board).ok).toBe(true)
    expect(board.frames.map((f) => f.id)).toEqual(
      essayScenes(essay.value, "sample").map((s) => s.id)
    )
    expect(board.frames[0]?.said).toContain("This is a sample")
  })
})
