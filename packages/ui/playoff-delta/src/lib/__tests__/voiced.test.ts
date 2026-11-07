/**
 * Playoff Delta voiced (FEED3): from version 2 every episode is framed by
 * the shape (the locked intro, the brand slides, a chapter said aloud before
 * each marked slide), the intro is code's and names who and what made it,
 * and the cut list holds every scene still, with subtitles from the takes.
 */
import { packetOf, type Narration } from "@playoff-delta/lib/narration"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  FORMAT_VERSION,
  formatOf,
  VOICED_VERSION,
} from "@playoff-delta/lib/show"
import {
  LEGEND_SLIDES,
  LEGEND_WEEK,
  SCENES,
  WEEK_SLIDES,
} from "@playoff-delta/lib/slides"
import { introOf, voicedCutList, voicedScenes } from "@playoff-delta/lib/voiced"
import { FORECAST } from "@playoff-delta/lib/words"
import { parseCutList } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

async function fillOf(week: number): Promise<Narration> {
  const p = await packetOf(SAMPLE_SEASON, week)
  if (!p.ok) throw new Error(p.problems.join("; "))
  return {
    ...p.value.pins,
    scenes: p.value.scenes.map((s) => ({
      id: s.id,
      said: `Said over ${s.name}.`,
    })),
  }
}

describe("the voiced scenes", () => {
  it("frame a week's slides in the shape, a chapter before each marked slide", async () => {
    const fill = await fillOf(9)
    const ids = voicedScenes(SAMPLE_SEASON, 9, 2, fill).map((s) => s.id)
    expect(ids).toEqual([
      "intro",
      "brand-in",
      "chapter-division",
      "division",
      "conference",
      "chapter-results",
      "results",
      "chapter-standings",
      "standings",
      "ladder",
      "season",
      "outro",
      "brand-out",
    ])
    const shape = formatOf("week").shape
    expect(shape?.chapters.map((c) => `chapter-${c}`)).toEqual(
      ids.filter((id) => id.startsWith("chapter-"))
    )
  })

  it("say each slide's fill, each chapter its slide's name, and nothing over a brand slide", async () => {
    const fill = await fillOf(9)
    for (const scene of voicedScenes(SAMPLE_SEASON, 9, 2, fill)) {
      if (scene.kind === "slide")
        expect(scene.said).toBe(`Said over ${SCENES[scene.id].name}.`)
      if (scene.kind === "chapter")
        expect(scene.said).toBe(`${SCENES[scene.of].name}.`)
      if (scene.kind === "brand-in" || scene.kind === "brand-out")
        expect(scene.said).toBe("")
    }
  })

  it("frame the legend too, and leave a version before the shape unframed", async () => {
    const legend = voicedScenes(
      SAMPLE_SEASON,
      LEGEND_WEEK,
      2,
      await fillOf(LEGEND_WEEK)
    )
    expect(legend.filter((s) => s.kind === "slide").map((s) => s.id)).toEqual([
      ...LEGEND_SLIDES,
    ])
    expect(legend[0]?.kind).toBe("intro")
    expect(legend.at(-1)?.kind).toBe("brand-out")
    expect(voicedScenes(SAMPLE_SEASON, 9, 1, null).map((s) => s.id)).toEqual([
      ...WEEK_SLIDES,
    ])
    expect(VOICED_VERSION).toBeLessThanOrEqual(FORMAT_VERSION.week)
  })
})

describe("the locked intro", () => {
  it("names who wrote it, what drew it, that the voice is synthetic, and whose side, by name", () => {
    const intro = introOf(SAMPLE_SEASON, 9, 2)
    const team = SAMPLE_SEASON.names[SAMPLE_SEASON.team] ?? ""
    expect(intro.rows.map((r) => r.label)).toEqual([
      "Written by",
      "Numbers by",
      "Drawn by",
      "Voices",
      "Read from",
    ])
    expect(intro.said).toContain(`${SAMPLE_SEASON.label}, week 9`)
    expect(intro.said).toContain(team)
    expect(intro.said).toContain("synthetic")
    expect(intro.said).not.toMatch(new RegExp(`\\b${SAMPLE_SEASON.team}\\b`))
    expect(FORECAST.test(intro.said)).toBe(false)
    expect(introOf(SAMPLE_SEASON, LEGEND_WEEK, 2).said).toContain("the legend")
  })
})

describe("the cut list", () => {
  it("holds every scene's still, its take where said, in the series' full-frame version", async () => {
    const fill = await fillOf(9)
    const scenes = voicedScenes(SAMPLE_SEASON, 9, 2, fill)
    const takes = scenes.map((s) =>
      s.said === ""
        ? null
        : { ms: 1_000, words: [{ text: "Said", startMs: 0, endMs: 400 }] }
    )
    const cut = parseCutList(voicedCutList(SAMPLE_SEASON, 9, fill, takes))
    if (!cut.ok) throw new Error(cut.problems.join("; "))
    expect(cut.value.series).toEqual({ id: "playoff-delta-week", version: 2 })
    expect(cut.value.subtitles).toBe("word")
    expect(cut.value.music).toBe("off")
    expect(cut.value.shots.map((s) => s.id)).toEqual(scenes.map((s) => s.id))
    expect(cut.value.shots[0]?.picture).toEqual({
      kind: "still",
      source: "01-intro.png",
    })
    expect(
      cut.value.shots.every((s) => s.overrides.motion?.kind === "still")
    ).toBe(true)
    expect(cut.value.shots[1]?.take).toBeUndefined()
    expect(
      voicedCutList(SAMPLE_SEASON, 9, fill, takes, { bed: true }).music
    ).toBeUndefined()
  })
})
