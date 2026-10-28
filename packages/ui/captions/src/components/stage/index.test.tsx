import { CaptionStage } from "@captions/components/stage"
import { frameAt } from "@captions/lib/frame"
import { THEMES } from "@captions/lib/theme"
import { groupCaptions } from "@captions/lib/timing"
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
  40
)

describe("the stage", () => {
  it("draws the frame it is given: the word being said in the highlight", () => {
    const theme = THEMES.broadcast
    const { container } = render(
      <CaptionStage
        frame={frameAt(captions, theme, 300)}
        theme={theme}
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

  it("draws no caption between captions, and the outline only when asked", () => {
    const theme = THEMES.gridiron
    const { container } = render(
      <CaptionStage
        frame={frameAt(captions, theme, 5000)}
        theme={theme}
        outline
        label="short"
      />
    )
    expect(container.querySelector(".cap-word")).toBeNull()
    expect(container.querySelector(".cap-safe")).not.toBeNull()
  })
})
