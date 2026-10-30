import { BurnInStage } from "@burn-ins/components/stage"
import { frameAt as burnInAt, prepare } from "@burn-ins/lib/burn-in"
import { byChars } from "@burn-ins/lib/captions/__tests__/word"
import { frameAt } from "@burn-ins/lib/captions/frame"
import { THEMES } from "@burn-ins/lib/captions/theme"
import { groupCaptions } from "@burn-ins/lib/captions/timing"
import { GAME_CARD_SAMPLES, SAMPLES } from "@burn-ins/lib/samples"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

const captions = groupCaptions(
  [
    {
      words: [
        { text: "third", startMs: 0, endMs: 200 },
        { text: "and", startMs: 250, endMs: 400 },
      ],
    },
  ],
  byChars(40)
)

describe("the stage", () => {
  it("draws the frame it is given: the word being said in the highlight", () => {
    const theme = THEMES.broadcast
    const { container } = render(
      <BurnInStage
        frames={[
          {
            kind: "captions",
            design: "broadcast",
            frame: frameAt(captions, theme, 300),
          },
        ]}
        label="short"
      />
    )
    const words = [...container.querySelectorAll<HTMLElement>(".cap-word")]
    expect(words.map((w) => [w.textContent, w.dataset["state"]])).toEqual([
      ["third", "said"],
      ["and", "now"],
    ])
    expect(words[1]?.style.color).toBe("rgb(76, 201, 240)")
    expect(words[0]?.style.color).toBe("rgb(244, 246, 251)")
  })

  it("draws the outline when asked", () => {
    const { container } = render(
      <BurnInStage frames={[]} outline label="short" />
    )
    expect(container.querySelector(".bi-outline")).not.toBeNull()
  })

  it("draws a card's panel and each of its rows", () => {
    const card = prepare({ kind: "card", design: "v1", params: SAMPLES.card })
    if (!card.ok) throw new Error(card.problems.join("; "))
    const { container } = render(
      <BurnInStage frames={[burnInAt(card.value, 0)]} label="short" />
    )
    expect(container.querySelectorAll(".bi-panel")).toHaveLength(1)
    const rows = [...container.querySelectorAll(".bi-text > div")].map(
      (r) => r.textContent
    )
    expect(rows[0]).toBe("BUILD JOURNAL · SHORT 7")
    expect(rows.join(" ")).toContain("never for one already up.")
  })

  it("draws a game card's panel, its words and the scenario's icon", () => {
    const card = prepare({
      kind: "game-card",
      design: "gridiron-v1",
      params: GAME_CARD_SAMPLES.scenario,
    })
    if (!card.ok) throw new Error(card.problems.join("; "))
    const { container } = render(
      <BurnInStage frames={[burnInAt(card.value, 0)]} label="short" />
    )
    expect(container.querySelectorAll(".bi-panel")).toHaveLength(2)
    const icon = container.querySelector("svg.bi-glyph")
    expect(icon?.getAttribute("stroke")).toBe("#ffd60a")
    expect(icon?.querySelectorAll("path").length).toBeGreaterThan(0)
    const rows = [...container.querySelectorAll(".bi-text > div")].map(
      (r) => r.textContent
    )
    expect(rows).toEqual(["During the game", "Third and long", "Converted"])
  })
})
