import { isLine } from "@some-ui/makjang"
import { cleanup, render } from "@testing-library/react"
import type { Panel } from "@topik/lib/topik/core/drama"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WebtoonPanel } from "."

afterEach(cleanup)

const lesson = workedLesson()
const line = lesson.root.beats.find(isLine)
if (line === undefined) throw new Error("the worked example has no line")

const linePanel: Panel = { kind: "line", id: line.id, line, feeling: "tension" }

const renderPanel = (panel: Panel, speaking: string | null): Element => {
  const { container } = render(
    <WebtoonPanel
      panel={panel}
      lesson={lesson}
      rungOf={() => 1}
      onReveal={vi.fn()}
      whyOpen={() => false}
      onWhy={vi.fn()}
      audio
      speaking={speaking}
      onReplay={vi.fn()}
    />
  )
  const figure = container.querySelector("[data-slot='cast-figure']")
  if (figure === null) throw new Error("no cast figure")
  return figure
}

describe("WebtoonPanel's cast figure", () => {
  it("draws a line's speaker as the figure the cast names, still until heard", () => {
    const figure = renderPanel(linePanel, null)
    expect(line.speaker).toBe("chairman")
    expect(figure.getAttribute("data-figure")).toBe("elder")
    expect(figure.hasAttribute("data-speaking")).toBe(false)
  })

  it("animates the figure while its line is heard, and only then", () => {
    expect(renderPanel(linePanel, line.id).hasAttribute("data-speaking")).toBe(
      true
    )
    cleanup()
    expect(
      renderPanel(linePanel, "another-beat").hasAttribute("data-speaking")
    ).toBe(false)
  })

  it("draws the chosen line with the point of view's figure, never speaking", () => {
    const choice = lesson.root.choice
    const candidate = choice?.check.options[0]
    if (choice === undefined || candidate === undefined) {
      throw new Error("the worked example's root has no choice")
    }
    const chosen: Panel = {
      kind: "chosen",
      id: "chosen",
      speaker: lesson.pov,
      chosen: { choice: choice.id, candidate },
    }
    const figure = renderPanel(chosen, "chosen")
    expect(figure.getAttribute("data-figure")).toBe("heart")
    expect(figure.hasAttribute("data-speaking")).toBe(false)
  })
})
