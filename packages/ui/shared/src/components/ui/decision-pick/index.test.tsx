/**
 * What `DecisionPick` owns (RR29, C693): every listed option and the
 * person's own, one button each, the recommended one tagged; a tap hands the
 * pick back; nothing picked says the host's default.
 */
import { fireEvent, render, screen, within } from "@testing-library/react"
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
    const group = screen.getByRole("group", { name: WORDS.label })
    const options = within(group).getAllByRole("button")
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveTextContent(`A${WORDS.recommended}Clone it`)
    expect(options[1]).not.toHaveTextContent(WORDS.recommended)
    expect(options[2]).toHaveTextContent(WORDS.own)
    for (const option of options) {
      expect(option).toHaveAttribute("aria-pressed", "false")
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
    const [a, b, own] = screen.getAllByRole("button")
    expect(b).toHaveAttribute("aria-pressed", "true")
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
    expect(own).toHaveAttribute("aria-pressed", "true")
    expect(own).toBeDisabled()
  })

  it("draws what an option shows outside its button, so a tap on it picks nothing", () => {
    const onPick = vi.fn<(pick: DecisionPicked) => void>()
    render(
      <DecisionPick
        options={[
          { ...OPTIONS[0]!, shows: <span>the clip</span> },
          OPTIONS[1]!,
        ]}
        picked={null}
        onPick={onPick}
        words={WORDS}
      />
    )
    const shown = screen.getByText("the clip")
    expect(shown.closest("button")).toBeNull()
    fireEvent.click(shown)
    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getAllByRole("button")).toHaveLength(3)
  })

  it("holds one option on its own, the rest and the own one still picking", () => {
    const onPick = vi.fn<(pick: DecisionPicked) => void>()
    render(
      <DecisionPick
        options={[{ ...OPTIONS[0]!, disabled: true }, OPTIONS[1]!]}
        picked={null}
        onPick={onPick}
        words={WORDS}
      />
    )
    const [a, b, own] = screen.getAllByRole("button")
    expect(a).toBeDisabled()
    expect(b).not.toBeDisabled()
    expect(own).not.toBeDisabled()
    fireEvent.click(b!)
    expect(onPick).toHaveBeenCalledWith({ kind: "option", option: "B" })
  })
})
