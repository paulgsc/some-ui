import { isLine } from "@some-ui/makjang"
import { cleanup, render, screen } from "@testing-library/react"
import type { Panel } from "@topik/lib/topik/core/drama"
import { workedLesson } from "@topik/lib/topik/generation/tree-intake/worked-example"
import { afterEach, describe, expect, it, vi } from "vitest"

import { WebtoonPanel } from "."

afterEach(cleanup)

const lesson = workedLesson()
const line = lesson.root.beats.find(isLine)
if (line === undefined) throw new Error("the worked example has no line")

const linePanel: Panel = {
  kind: "line",
  id: line.id,
  line,
  feeling: "tension",
  final: false,
}

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
    const id = candidate?.id
    if (choice === undefined || candidate === undefined || id === undefined) {
      throw new Error("the worked example's root has no choice")
    }
    const chosen: Panel = {
      kind: "chosen",
      id: "chosen",
      speaker: lesson.pov,
      chosen: {
        choice: choice.id,
        candidate: { ...candidate, id },
        swallowed: false,
      },
    }
    const figure = renderPanel(chosen, "chosen")
    expect(figure.getAttribute("data-figure")).toBe("heart")
    expect(figure.hasAttribute("data-speaking")).toBe(false)
  })
})

describe("WebtoonPanel's script", () => {
  const draw = (panel: Panel, rung: 1 | 2 = 1): void => {
    render(
      <WebtoonPanel
        panel={panel}
        lesson={lesson}
        rungOf={() => rung}
        onReveal={vi.fn()}
        whyOpen={() => false}
        onWhy={vi.fn()}
        audio={false}
        speaking={null}
        onReplay={vi.fn()}
      />
    )
  }

  it("shows a line's Korean cue with the line, not only with its gloss", () => {
    draw(linePanel)
    expect(screen.getByText("(고개도 들지 않고)")).toBeTruthy()
  })

  it("ends a leaf on its hook, the next episode's question, its gloss a tap away", () => {
    const leaf = lesson.root.choice?.options.find(({ id }) => id === "a")?.child
    if (leaf?.hook === undefined) throw new Error("the keyed leaf has no hook")
    const ending: Panel = {
      kind: "ending",
      id: "end",
      scene: leaf,
      feeling: "twist",
    }
    draw(ending)
    expect(screen.getByText("다음 화 예고")).toBeTruthy()
    expect(screen.getByText(leaf.hook.text)).toBeTruthy()
    expect(screen.queryByText(leaf.hook.gloss)).toBeNull()
    cleanup()
    draw(ending, 2)
    expect(screen.getByText(leaf.hook.gloss)).toBeTruthy()
  })
})
