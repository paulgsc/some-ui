/**
 * What `DecisionPick` owns (RR29, C693): every listed option and the
 * person's own, one radio each, the recommended one tagged; a tap hands the
 * pick back; nothing picked says the host's default.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { DecisionPicked } from "."
import { DecisionPick } from "."

const WORDS = {
  label: "How should the loop get each address?",
  recommended: "Recommended",
  own: "Something else: say it",
  none: "Going with the recommended",
}

const OPTIONS = [
  { id: "A", decision: "Clone it", recommended: true },
  { id: "B", decision: "Derive Copy", recommended: false },
]

describe("DecisionPick", () => {
  it("lists each option and the own one, the recommended tagged, and says the default while none is picked", () => {
    render(
      <DecisionPick
        options={OPTIONS}
        picked={null}
        onPick={() => undefined}
        words={WORDS}
      />
    )
    const group = screen.getByRole("radiogroup", { name: WORDS.label })
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(3)
    expect(radios[0]).toHaveTextContent(`A${WORDS.recommended}Clone it`)
    expect(radios[1]).not.toHaveTextContent(WORDS.recommended)
    expect(radios[2]).toHaveTextContent(WORDS.own)
    for (const radio of radios) {
      expect(radio).toHaveAttribute("aria-checked", "false")
    }
    expect(group.parentElement).toHaveTextContent(WORDS.none)
  })

  it("hands back the option tapped, or the own one, and shows what is picked", () => {
    const onPick = vi.fn<(pick: DecisionPicked) => void>()
    const { rerender } = render(
      <DecisionPick
        options={OPTIONS}
        picked={{ kind: "option", option: "B" }}
        onPick={onPick}
        words={WORDS}
      />
    )
    const [a, b, own] = screen.getAllByRole("radio")
    expect(b).toHaveAttribute("aria-checked", "true")
    expect(screen.queryByText(WORDS.none)).toBeNull()
    fireEvent.click(a!)
    fireEvent.click(own!)
    expect(onPick.mock.calls).toEqual([
      [{ kind: "option", option: "A" }],
      [{ kind: "own" }],
    ])
    rerender(
      <DecisionPick
        options={OPTIONS}
        picked={{ kind: "own" }}
        onPick={onPick}
        words={WORDS}
        disabled
      />
    )
    expect(own).toHaveAttribute("aria-checked", "true")
    expect(own).toBeDisabled()
  })
})
