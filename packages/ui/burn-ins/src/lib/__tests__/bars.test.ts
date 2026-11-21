/** @vitest-environment node */
import { axisStep, BAR_COLOURS, type BarsFrame } from "@burn-ins/lib/bars"
import { frameAt, prepare } from "@burn-ins/lib/burn-in"
import { cardBody, ITEM } from "@burn-ins/lib/cards"
import {
  geometryOf,
  LANDSCAPE,
  PORTRAIT,
  type FrameSize,
} from "@burn-ins/lib/geometry"
import { describe, expect, it } from "vitest"

const bars = (
  params: object,
  frame: FrameSize = LANDSCAPE
): ReturnType<typeof prepare> =>
  prepare(
    {
      kind: "bars",
      design: "bars-v1",
      params: {
        title: "T",
        stamp: { sources: ["paulgsc/some-ui@7a3dc3f"], date: "2026-11-21" },
        ...params,
      },
    },
    frame
  )

const at = (
  params: object,
  t: number,
  frame: FrameSize = LANDSCAPE
): BarsFrame => {
  const p = bars(params, frame)
  if (!p.ok) throw new Error(p.problems.join("; "))
  const f = frameAt(p.value, t)
  if (f.kind !== "bars") throw new Error(f.kind)
  return f.frame
}

const refused = (params: object, frame?: FrameSize): string => {
  const p = bars(params, frame)
  return p.ok ? "" : p.problems.join("\n")
}

/** The CI audit's jobs, as the open-question essay draws them (#3387). */
const JOBS = {
  series: ["couldn't fail", "could fail"],
  unit: "min",
  rows: [
    { label: "Rust deny (5 jobs)", values: [604.8, 20.6], note: "605 of 625" },
    { label: "Rust CI", values: [149.8, 5.1], note: "150 of 155" },
    { label: "Node license audit", values: [113.2, 21.8], note: "113 of 135" },
    { label: "Node e2e", values: [76.9, 783.9], note: "77 of 861" },
    { label: "Render image", values: [50.8, 132], note: "51 of 183" },
    {
      label: "Node checks (3 jobs)",
      values: [4.9, 1172.5],
      note: "5 of 1,177",
    },
  ],
}

describe("the bars card", () => {
  it("draws every row, in both frames, inside the card's body", () => {
    for (const frame of [LANDSCAPE, PORTRAIT]) {
      const f = at(JOBS, 60_000, frame)
      expect(f.rows).toHaveLength(JOBS.rows.length)
      const body = cardBody(geometryOf(frame))
      for (const r of f.rows)
        for (const b of [r.label.box, ...r.parts.map((p) => p.box)]) {
          expect(b.x).toBeGreaterThanOrEqual(body.x)
          expect(b.x + b.width).toBeLessThanOrEqual(body.x + body.width + 0.5)
          expect(b.y + b.height).toBeLessThanOrEqual(body.y + body.height)
        }
    }
  })

  it("brings its rows in one at a time, as a card's items", () => {
    expect(at(JOBS, 0).rows).toHaveLength(0)
    expect(at(JOBS, ITEM.leadMs).rows).toHaveLength(1)
    expect(at(JOBS, ITEM.leadMs + ITEM.gapMs).rows).toHaveLength(2)
  })

  it("colours each part by its series, in the palette's order, and parts them by a gap", () => {
    const [first] = at(JOBS, 60_000).rows
    expect(first?.parts.map((p) => p.fill)).toEqual(BAR_COLOURS.slice(0, 2))
    const [a, b] = first?.parts ?? []
    if (a === undefined || b === undefined) throw new Error("two parts")
    expect(b.box.x - (a.box.x + a.box.width)).toBeCloseTo(2)
  })

  it("draws lengths in proportion, and keeps a bar's length whole across its gaps", () => {
    const f = at(JOBS, 60_000)
    const length = (i: number): number => {
      const parts = f.rows[i]?.parts ?? []
      const last = parts.at(-1)
      return last === undefined
        ? 0
        : last.box.x + last.box.width - (parts[0]?.box.x ?? 0)
    }
    const total = (i: number): number =>
      (JOBS.rows[i]?.values ?? []).reduce((x, y) => x + y, 0)
    expect(length(0) / length(5)).toBeCloseTo(total(0) / total(5), 2)
  })

  it("draws nothing for a part of nothing", () => {
    const f = at(
      { ...JOBS, rows: [{ label: "None of it", values: [0, 10] }] },
      60_000
    )
    expect(f.rows[0]?.parts.map((p) => p.fill)).toEqual([BAR_COLOURS[1]])
  })

  it("steps its axis by 1, 2, 2.5 or 5 of a power of ten, five steps at most", () => {
    expect(axisStep(1177)).toBe(250)
    expect(axisStep(90)).toBe(20)
    expect(axisStep(7052)).toBe(2000)
    for (const top of [1, 7, 33, 86, 625, 1177, 7052, 123_456])
      expect(top / axisStep(top)).toBeLessThanOrEqual(5)
  })

  it("refuses a row whose parts aren't one per series, naming it", () => {
    expect(
      refused({ ...JOBS, rows: [{ label: "Odd", values: [1, 2, 3] }] })
    ).toContain("rows.0.values: it has 3 parts, and the chart 2 series")
  })

  it("refuses a bar past an axis end it was given", () => {
    expect(refused({ ...JOBS, max: 100 })).toContain("past the axis's end")
  })

  it("refuses words that give a value, and a label that doesn't fit", () => {
    expect(
      refused({ ...JOBS, rows: [{ label: "TOKEN=abc", values: [1, 1] }] })
    ).toContain("row 1")
    expect(
      refused({
        ...JOBS,
        rows: [
          {
            label: "a label far too long to sit in two rows ".repeat(4),
            values: [1, 1],
          },
        ],
      })
    ).toContain("row 1: its label doesn't fit")
  })

  it("never lets a label run into the next row", () => {
    const long = (n: number): { label: string; values: Array<number> } => ({
      label: `A considerably longer label that has to wrap onto two lines ${String(n)}`,
      values: [1, 1],
    })
    const crowded = { ...JOBS, rows: [1, 2, 3, 4, 5, 6].map(long) }
    const p = bars(crowded)
    if (p.ok) {
      const rows = at(crowded, 60_000).rows
      rows.slice(1).forEach((r, i) => {
        const above = rows[i]?.label.box
        if (above === undefined) throw new Error("a row above")
        expect(above.y + above.height).toBeLessThanOrEqual(r.label.box.y)
      })
    } else expect(p.problems.join("\n")).toContain("its label doesn't fit")
  })

  it("ends its axis at the end it was given, with the unit, whatever the step", () => {
    const f = at({ ...JOBS, max: 1250 }, 60_000)
    const said = f.axis.blocks.map((b) => b.rows.join(" "))
    expect(said.at(-1)).toBe("1,250 min")
    // At 1,050 the step is 250, and the step at 1,000 is left out: it would
    // sit too near the end's number.
    const end = at({ ...JOBS, max: 1_050, rows: JOBS.rows.slice(0, 3) }, 60_000)
    const ends = end.axis.blocks.map((b) => b.rows.join(" "))
    expect(ends.at(-1)).toBe("1,050 min")
    expect(ends).not.toContain("1,000")
    expect(ends).toContain("750")
  })

  it("keeps a bar's whole length when its later parts are nothing", () => {
    const f = at(
      { ...JOBS, max: 100, rows: [{ label: "Half", values: [100, 0] }] },
      60_000
    )
    const [part] = f.rows[0]?.parts ?? []
    const end = f.axis.panels.at(-1)?.box
    if (part === undefined || end === undefined) throw new Error("drawn")
    expect(part.box.x + part.box.width).toBeCloseTo(end.x + end.width / 2)
  })

  it("refuses more series than its palette holds", () => {
    expect(refused({ ...JOBS, series: ["a", "b", "c", "d", "e"] })).not.toBe("")
  })
})
