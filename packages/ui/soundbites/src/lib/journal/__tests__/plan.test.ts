import { plan, PRIMER, take } from "@soundbites/lib/journal/__tests__/fixture"
import { journalManifest } from "@soundbites/lib/journal/export"
import {
  capFor,
  droppedBy,
  nudged,
  timeline,
} from "@soundbites/lib/journal/plan"
import { describe, expect, it } from "vitest"

describe("timeline", () => {
  it("sets the cuts end to end by their targets", () => {
    const line = timeline(plan({ targets: { flow: 45_000 } }), [
      take("flow", 50_000),
    ])
    expect(line.rows.map((row) => [row.startMs, row.targetMs])).toEqual([
      [0, 30_000],
      [30_000, 45_000],
      [75_000, 20_000],
    ])
    expect(line.rows[1]?.take?.durationMs).toBe(50_000)
    expect(line).toMatchObject({
      plannedMs: 95_000,
      recordedMs: 50_000,
      budgetMs: 180_000,
      scaleMs: 180_000,
    })
  })

  it("widens the scale to a plan longer than the budget", () => {
    const line = timeline(plan({ targets: { flow: 160_000 } }), [])
    expect(line.plannedMs).toBe(210_000)
    expect(line.scaleMs).toBe(210_000)
  })
})

describe("capFor", () => {
  it("is the budget less every other cut's take, its own given back", () => {
    const takes = [take("gap", 70_000), take("flow", 100_000)]
    expect(capFor(plan(), takes, "next")).toBe(10_000)
    expect(capFor(plan(), takes, "flow")).toBe(110_000)
  })

  it("ignores a take whose cut the plan no longer has", () => {
    expect(capFor(plan(), [take("gone", 170_000)], "gap")).toBe(180_000)
  })
})

describe("nudged", () => {
  it("moves a target, within three seconds and the budget", () => {
    const p = plan()
    expect(nudged(p, "gap", 5_000)).toEqual({ gap: 35_000 })
    expect(nudged(plan({ targets: { gap: 4_000 } }), "gap", -5_000)).toEqual({
      gap: 3_000,
    })
    expect(nudged(plan({ targets: { gap: 178_000 } }), "gap", 5_000)).toEqual({
      gap: 180_000,
    })
    expect(nudged(p, "missing", 5_000)).toBe(p.targets)
  })
})

describe("droppedBy", () => {
  it("names the takes a primer has no cut for", () => {
    const revised = { ...PRIMER, cuts: PRIMER.cuts.slice(1) }
    expect(
      droppedBy(revised, [take("gap", 5_000), take("flow", 5_000)])
    ).toEqual(["gap"])
  })
})

describe("the export", () => {
  it("names each take for its place and cut, in the primer's order", () => {
    const manifest: unknown = JSON.parse(
      journalManifest(
        plan(),
        [take("next", 5_000), take("gap", 5_000)],
        "2026-10-12T13:00:00.000Z",
        "UTC"
      )
    )
    expect(manifest).toMatchObject({
      cuts: [
        { id: "gap", take: { file: "01-gap.webm" } },
        { id: "flow", take: null },
        { id: "next", take: { file: "03-next.webm" } },
      ],
    })
  })

  it("lists every cut, a missing take as null, with the moved targets", () => {
    const manifest: unknown = JSON.parse(
      journalManifest(
        plan({ targets: { gap: 35_000 } }),
        [take("gap", 21_400.4)],
        "2026-10-12T13:00:00.000Z",
        "America/Los_Angeles"
      )
    )
    expect(manifest).toMatchObject({
      kind: "build-journal-takes",
      version: 1,
      title: "AMO release notes",
      budgetMs: 180_000,
      timeZone: "America/Los_Angeles",
      cuts: [
        {
          id: "gap",
          artifact: "Old notes",
          prompt: "What was missed?",
          targetMs: 35_000,
          take: {
            file: "01-gap.webm",
            recordedAt: "2026-10-12T12:00:00.000Z",
            durationMs: 21_400,
            mimeType: "audio/webm;codecs=opus",
          },
        },
        expect.objectContaining({ id: "flow", targetMs: 60_000, take: null }),
        expect.objectContaining({ id: "next", take: null }),
      ],
    })
  })
})
