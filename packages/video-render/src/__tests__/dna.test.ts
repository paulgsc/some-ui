import {
  parseVideoDna,
  VIDEO_DNA_MAX_TAKES,
  VIDEO_DNA_SCHEMA,
} from "@video-render/dna"
import { EPISODE_SCHEMA } from "@video-render/episode"
import { cutList, shot, SUM } from "@video-render/testing"
import { describe, expect, it } from "vitest"

/** The episode the DNA below fills. */
const PIN = {
  schema: EPISODE_SCHEMA,
  show: "Playoff Delta",
  format: { id: "playoff-delta", version: 2 },
  period: "2026 week 8",
  data: { source: "espn", sha256: SUM },
}

/** An episode's DNA as the phone queues it: two scenes, each with its take. */
function dna(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: VIDEO_DNA_SCHEMA,
    video: "playoff-delta-20261105T170211Z",
    rev: 3,
    title: "Playoff Delta · 2026 week 8",
    queuedAt: "2026-11-05T17:02:11.123Z",
    template: { kind: "show-format", id: "playoff-delta", version: 2 },
    takes: [
      { scene: "division", note: "take-1" },
      { scene: "wildcard", note: "take-2" },
    ],
    shape: cutList([shot("division"), shot("wildcard")]),
    data: {
      episode: PIN,
      scenes: [
        { scene: "division", point: "The division moved", keep: ["3-1"] },
        { scene: "wildcard", point: "The wildcard race", keep: [] },
      ],
    },
    ...over,
  }
}

const problemsOf = (raw: unknown): ReadonlyArray<string> => {
  const parsed = parseVideoDna(raw)
  return parsed.ok ? [] : parsed.problems
}

describe("parseVideoDna (ST33)", () => {
  it("reads an episode's DNA, its shape a cut list as the renderer reads it", () => {
    const parsed = parseVideoDna(dna())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.shape.shots.map((each) => each.id)).toEqual([
      "division",
      "wildcard",
    ])
    expect(parsed.value.takes).toHaveLength(2)
  })

  it("refuses another schema, a title home wouldn't keep and a time that is none", () => {
    expect(problemsOf(dna({ schema: "some-ui.video-dna/2" }))).not.toEqual([])
    // Home's rule: 1 to 200 characters once trimmed, with no control character.
    expect(problemsOf(dna({ title: "x".repeat(201) }))).toContain(
      "title: a title has at most 200 characters"
    )
    expect(problemsOf(dna({ title: "x".repeat(200) }))).toEqual([])
    expect(problemsOf(dna({ title: "한".repeat(200) }))).toEqual([])
    expect(problemsOf(dna({ title: "   " }))).not.toEqual([])
    for (const title of ["one\ntwo", "tab\there", "bell\u0007"])
      expect(problemsOf(dna({ title }))).toContain(
        "title: a title is one line, with no control characters"
      )
    expect(problemsOf(dna({ queuedAt: "yesterday" }))).not.toEqual([])
    expect(
      problemsOf(dna({ queuedAt: "2026-11-05T09:02:11-08:00" }))
    ).not.toEqual([])
  })

  it("holds the template, the takes and every field to home's rules", () => {
    const template = (over: Record<string, unknown>): Record<string, unknown> =>
      dna({
        template: {
          kind: "show-format",
          id: "playoff-delta",
          version: 2,
          ...over,
        },
      })
    // A template's id is a name the code gives it, as home's `is_name` reads one.
    expect(problemsOf(template({ id: "Playoff-Delta" }))).not.toEqual([])
    expect(problemsOf(template({ id: "-delta" }))).not.toEqual([])
    expect(problemsOf(template({ id: "x".repeat(65) }))).not.toEqual([])
    expect(problemsOf(template({ version: 0 }))).not.toEqual([])
    expect(problemsOf(template({ assets: [] }))).not.toEqual([])
    const takes = (each: ReadonlyArray<unknown>): Record<string, unknown> =>
      dna({ takes: each })
    // A scene is one of those names too, and a note never one of home's routes.
    expect(
      problemsOf(takes([{ scene: "Division", note: "take-1" }]))
    ).not.toEqual([])
    expect(
      problemsOf(takes([{ scene: "division", note: "kept" }]))
    ).not.toEqual([])
    expect(
      problemsOf(takes([{ scene: "division", note: "take-1", words: "hi" }]))
    ).not.toEqual([])
    // At most 200 takes.
    const many = Array.from({ length: VIDEO_DNA_MAX_TAKES + 1 }, (_, n) => ({
      scene: "division",
      note: `take-${String(n)}`,
    }))
    expect(problemsOf(takes(many))).not.toEqual([])
    // No field version 1 doesn't carry.
    expect(problemsOf(dna({ filled: true }))).not.toEqual([])
  })

  it("refuses a shape the renderer couldn't draw, saying so under shape", () => {
    const shape = cutList([
      shot("division", { take: { file: "t.webm", inMs: 900, outMs: 100 } }),
      shot("wildcard"),
    ])
    expect(problemsOf(dna({ shape }))).toEqual([
      "shape: division: the take ends before it starts",
    ])
  })

  it("refuses takes and data for scenes the shape doesn't have, and two takes for one scene", () => {
    expect(
      problemsOf(
        dna({
          takes: [
            { scene: "division", note: "take-1" },
            { scene: "division", note: "take-3" },
            { scene: "gone", note: "take-2" },
          ],
        })
      )
    ).toEqual([
      "takes: scene division has two takes",
      "takes: the shape has no scene gone",
    ])
    expect(
      problemsOf(
        dna({
          data: {
            episode: PIN,
            scenes: [{ scene: "gone", point: "Not a scene", keep: [] }],
          },
        })
      )
    ).toEqual(["data.scenes: the shape has no scene gone"])
  })

  it("refuses a template that isn't the format the episode pins", () => {
    expect(
      problemsOf(
        dna({
          template: { kind: "show-format", id: "playoff-delta", version: 3 },
        })
      )
    ).toEqual(["template: it isn't the format the episode pins"])
  })
})
