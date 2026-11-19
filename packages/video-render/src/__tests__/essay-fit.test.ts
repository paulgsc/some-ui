/**
 * `pointsFit` (essay-fit): what a ticket's points alone take of its best and
 * beside scenes is a lower bound of `essayFit`'s, so the routine never
 * writes a week whose essay can't fit, and never refuses one whose could.
 */
import type { Essay } from "@some-ui/video-render"
import { essayFit, pointsFit, sampleEssay } from "@some-ui/video-render"
import { describe, expect, it } from "vitest"

const SHORT = "Borrow, clone or take the address?"
const WRAPS = "How should print and reprint share the log?"

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
  silent.dives = silent.dives.slice(0, 1).map((dive) => ({ ...dive, point: 0 }))
  return { essay, id: silent.id }
}

describe("pointsFit", () => {
  it("refuses exactly where essayFit refuses the least essay of those points", () => {
    for (const question of [SHORT, WRAPS])
      for (let n = 1; n <= 6; n += 1) {
        const points = Array.from({ length: n }, () => question)
        const { essay, id } = leastEssayOf(points)
        const later = essayFit(essay).problems.filter(
          (p) => p.startsWith(`${id} best`) || p.startsWith(`${id} beside`)
        )
        expect(pointsFit(id, points).length, `${n} × "${question}"`).toBe(
          later.length
        )
      }
  })

  it("leaves four short questions, or two that wrap, their room", () => {
    expect(pointsFit("TB-101", Array(4).fill(SHORT))).toEqual([])
    expect(pointsFit("TB-101", Array(2).fill(WRAPS))).toEqual([])
    expect(pointsFit("TB-101", Array(3).fill(WRAPS))).not.toEqual([])
  })
})
