/**
 * Every slide of every week of the bundled season renders, so a bye, the
 * exit week and the weeks after it are drawn, and so does a week the team
 * goes out (the bundled season has none, so one is made from its first), and
 * every slide of the legend.
 */
import { LEGEND, SLIDES } from "@playoff-delta/components/slides"
import { REAL_WEEKS } from "@playoff-delta/lib/__tests__/seasons"
import { piecesOf } from "@playoff-delta/lib/reading"
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import {
  LEGEND_SLIDES,
  legendLine,
  narration,
  slidesFor,
} from "@playoff-delta/lib/slides"
import type { StorySeason, StoryWeek } from "@playoff-delta/lib/story"
import { MATERIAL } from "@playoff-delta/lib/words"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const first = SAMPLE_SEASON.weeks[0]
if (!first) throw new Error("no weeks")
const OUT: StorySeason = {
  ...SAMPLE_SEASON,
  weeks: [
    {
      ...first,
      paths: { ...first.paths, after: first.paths.after.map(() => null) },
      share: { ...first.share, after: 0 },
    },
  ],
}

const CASES = [
  ...SAMPLE_SEASON.weeks.map((w) => [w.week, SAMPLE_SEASON, w] as const),
  [0, OUT, OUT.weeks[0] ?? first] as const,
]

describe("every slide of the bundled season", () => {
  it.each(CASES)(
    "week %i renders, with a voiceover line",
    (_, season, week) => {
      for (const id of slidesFor(week)) {
        const Slide = SLIDES[id]
        render(<Slide season={season} week={week} />).unmount()
        expect(narration(season, week, id), id).not.toBe("")
      }
    }
  )

  it("says the week out is a dead end, marked as a proof", () => {
    const [week] = OUT.weeks
    if (!week) throw new Error("no week")
    render(<SLIDES.verdict season={OUT} week={week} />)
    expect(screen.getByText("Dead end.").className).toContain("pd-proof")
    screen.getByText(/No way in is left\./)
  })

  it("says a week past the exit was not followed", () => {
    const after = SAMPLE_SEASON.weeks.at(-1)
    if (!after) throw new Error("no weeks")
    render(<SLIDES.verdict season={SAMPLE_SEASON} week={after} />)
    screen.getByText(/We stopped watching after week 15/)
  })
})

/** The "SF over ATL" labels a slide draws under its lights. */
function pieceLabels(season: StorySeason, week: StoryWeek): Set<string> {
  const { unmount } = render(<SLIDES.best season={season} week={week} />)
  const labels = screen
    .queryAllByText(/^[A-Z]+ over [A-Z]+$/)
    .map((e) => e.textContent)
  unmount()
  return new Set(labels)
}

// PDS4: the best week's voiceover line names the pieces its slide names: our
// light and the dearest of the league's by name, each with its material, and
// nothing the slide doesn't show. Family: every week of a real season (the
// bundled 2025, 2026 as published), across how many pieces are live, their
// mix of majors and minors, and our light live, idle, a bye or a tie.
describe("PDS4: the best week's line names what its slide names", () => {
  it.each(REAL_WEEKS)("%s week %i", (_, __, season, week) => {
    const shown = pieceLabels(season, week)
    const line = narration(season, week, "best")
    const said = [...line.matchAll(/\b[A-Z]+ over [A-Z]+\b/g)].map((m) => m[0])
    for (const name of said) expect(shown, line).toContain(name)

    const live = piecesOf(week)
      .filter((p) => p.material !== "idle")
      .sort((a, b) => b.piece.price - a.piece.price)
    const nameOf = (p: (typeof live)[number]): string =>
      `${p.piece.want} over ${p.piece.want === p.game.home ? p.game.away : p.game.home}`
    const own = live.find((p) => p.game.kind === "own")
    if (own && shown.has(nameOf(own)))
      expect(line).toContain(
        `${nameOf(own)} (our light, a ${MATERIAL[own.material].word})`
      )
    const dearest = live.find((p) => p.game.kind !== "own")
    if (dearest)
      expect(line).toContain(
        `${nameOf(dearest)} (a ${MATERIAL[dearest.material].word})`
      )
    if (live.length === 0)
      expect(line).toMatch(/No piece could move us a quarter point\.$/)
  })
})

// PDS5: each label under the strip sits under its own mark and inside the
// frame: placed at the mark's x and pulled back by that share of its own
// width, so the mark falls inside the label at either edge. Family: every
// week of a real season, on both strip slides, across where a mark falls on
// the axis (an edge, the middle) and how close two marks fall.
describe("PDS5: the strip's labels sit at their marks", () => {
  const STRIPS = ["best", "road"] as const
  it.each(REAL_WEEKS)("%s week %i", (_, __, season, week) => {
    for (const id of STRIPS) {
      const Slide = SLIDES[id]
      const { container, unmount } = render(
        <Slide season={season} week={week} />
      )
      const marks = container.querySelectorAll("line.pd-ways__mark")
      expect(marks.length, id).toBeGreaterThan(0)
      for (const mark of marks) {
        const tone =
          /pd-ways__mark--(\w+)/.exec(mark.getAttribute("class") ?? "")?.[1] ??
          "none"
        const key = container.querySelector<HTMLElement>(
          `.pd-ways__key--${tone}`
        )
        const place = key?.parentElement
        if (!place) throw new Error(`${id}: no label for the ${tone} mark`)
        const x = Math.min(100, Math.max(0, Number(mark.getAttribute("x1"))))
        expect(parseFloat(place.style.left), `${id} ${tone}`).toBeCloseTo(x, 6)
        expect(place.style.transform, `${id} ${tone}`).toBe(
          `translateX(-${place.style.left})`
        )
        // A reveal's animation fills its transform, which would replace the
        // placing one: the reveal must sit on another element.
        expect(place.className, `${id} ${tone}`).not.toMatch(/\bpd-in\b/)
      }
      unmount()
    }
  })
})

describe("the podium", () => {
  it("lists tied medalists a line each, and still says our place", () => {
    const tied = SAMPLE_SEASON.weeks.find((w) => w.podium.medals.length > 3)
    if (!tied) throw new Error("the bundled season has no tied podium")
    render(<SLIDES.podium season={SAMPLE_SEASON} week={tied} />)
    for (const m of tied.podium.medals) screen.getByText(m.team)
    screen.getByText(/^SF$/)
  })
})

describe("the legend", () => {
  it.each(LEGEND_SLIDES)("%s renders, with a voiceover line", (id) => {
    const Slide = LEGEND[id]
    render(<Slide />).unmount()
    expect(legendLine(id)).not.toBe("")
  })
})
