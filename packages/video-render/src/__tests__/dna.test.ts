import {
  parseVideoDna,
  VIDEO_DNA_MAX_BYTES,
  VIDEO_DNA_SCHEMA,
  videoDnaBytes,
} from "@video-render/dna"
import { EPISODE_SCHEMA } from "@video-render/episode"
import { cutList, shot, SUM } from "@video-render/testing"
import { describe, expect, it } from "vitest"

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
      episode: {
        schema: EPISODE_SCHEMA,
        show: "Playoff Delta",
        format: { id: "playoff-delta", version: 2 },
        period: "2026 week 8",
        data: { source: "espn", sha256: SUM },
      },
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

  it("refuses another schema, a title past 200 characters and a time that is none", () => {
    expect(problemsOf(dna({ schema: "some-ui.video-dna/2" }))).not.toEqual([])
    expect(problemsOf(dna({ title: "x".repeat(201) }))).toContain(
      "title: a title has at most 200 characters"
    )
    expect(problemsOf(dna({ title: "x".repeat(200) }))).toEqual([])
    expect(problemsOf(dna({ queuedAt: "yesterday" }))).not.toEqual([])
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

  it("counts its bytes as sent, against home's limit of 256 KiB", () => {
    const parsed = parseVideoDna(dna())
    if (!parsed.ok) throw new Error(parsed.problems.join("; "))
    expect(VIDEO_DNA_MAX_BYTES).toBe(262_144)
    expect(videoDnaBytes(parsed.value)).toBe(
      new TextEncoder().encode(JSON.stringify(parsed.value)).length
    )
    expect(videoDnaBytes(parsed.value)).toBeLessThan(VIDEO_DNA_MAX_BYTES)
  })
})
