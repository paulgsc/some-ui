/**
 * `pointsFit` (essay-fit): what a ticket's points alone take of its best and
 * beside scenes is a lower bound of `essayFit`'s, so the routine never
 * writes a week whose essay can't fit, and never refuses one whose could.
 */
import type { Essay } from "@some-ui/video-render"
import {
  essayFit,
  parseEssay,
  pointsFit,
  sampleEssay,
} from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

const SHORT = "Borrow, clone or take the address?"
const WRAPS = "How should print and reprint share the log?"
const LONG =
  "How should print and reprint share the log, given a jam can reprint any order while the first print still holds its borrow of it?"

/** The sample's silent ticket asking `points`, every other text at its least. */
function leastEssayOf(points: ReadonlyArray<string>): {
  essay: Essay
  id: string
} {
  const sample = sampleEssay()
  if (!sample.ok) throw new Error(sample.problems.join("\n"))
  const essay = structuredClone(sample.value)
  const silent = essay.tickets.find((t) => t.answer.kind === "silence")
  if (silent === undefined) throw new Error("the sample has a silence")
  silent.points = points.map((to) => ({ to, best: "." }))
  // A dive on each of its first two points, as a ticket of two or more takes.
  silent.dives = silent.dives
    .slice(0, Math.min(2, points.length))
    .map((dive, k) => ({ ...dive, point: k }))
  if (!parseEssay(essay).ok) throw new Error("the least essay must parse")
  return { essay, id: silent.id }
}

describe("pointsFit", () => {
  it("refuses exactly where essayFit refuses the least essay of those points", () => {
    const scenes = (problems: ReadonlyArray<string>): Array<string> =>
      problems.flatMap((p) => /\b(best|beside)\b/.exec(p)?.[1] ?? [])
    const refused = new Set<string>()
    for (const question of [SHORT, WRAPS, LONG])
      for (let n = 1; n <= 6; n += 1) {
        const points = Array.from({ length: n }, () => question)
        const { essay, id } = leastEssayOf(points)
        const later = scenes(
          essayFit(essay).problems.filter((p) => p.startsWith(`${id} `))
        )
        expect(scenes(pointsFit(id, points)), `${n} × "${question}"`).toEqual(
          later
        )
        for (const scene of later) refused.add(scene)
      }
    // Both scenes are refused somewhere, so neither half is vacuous.
    expect([...refused].sort()).toEqual(["beside", "best"])
  })

  it("leaves ROUTINE.md's budget its room: five one-line questions, or two that wrap with one that doesn't", () => {
    expect(pointsFit("TB-101", [WRAPS, WRAPS, SHORT])).toEqual([])
    expect(pointsFit("TB-101", Array(5).fill(SHORT))).toEqual([])
    expect(pointsFit("TB-101", Array(6).fill(SHORT))).not.toEqual([])
    expect(pointsFit("TB-101", Array(3).fill(WRAPS))).not.toEqual([])
  })
})
