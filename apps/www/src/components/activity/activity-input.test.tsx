/**
 * @vitest-environment jsdom
 *
 * The disclosure has to appear where the shape actually changes and stay away
 * everywhere else — a note on every card is a note on none of them.
 */

import { ACTIVITY_IDS, getActivity } from "@some-ui/activity-catalog"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ActivityInputHint, ActivityInputNote } from "./activity-input"

afterEach(() => {
  cleanup()
})

describe("activity input disclosure", () => {
  it("says nothing for an activity that asks nothing worth disclosing", () => {
    const { container } = render(
      <ActivityInputHint activity={getActivity("honeycomb")} />
    )
    expect(container.textContent).toBe("")
  })

  it("names both channels on the card, before the click", () => {
    render(<ActivityInputHint activity={getActivity("leetype")} />)

    const hint = screen.getByText(/typing on a keyboard/i)
    expect(hint.textContent).toMatch(/phone/i)
    expect(hint.getAttribute("data-input-modalities")).toBe("keyboard,touch")
  })

  it("adds the extra sentence only where the exercise genuinely changes", () => {
    const { container } = render(
      <ActivityInputNote activity={getActivity("topik")} />
    )
    expect(container.textContent).toBe("")

    render(<ActivityInputNote activity={getActivity("leetype")} />)
    expect(
      screen.getByText(/reading exercise rather than a typing one/i)
    ).toBeDefined()
  })

  // The hint is read on whatever device a person is browsing from, for a
  // session they may play on another one — so it must be true at every width
  // and must not claim to know which device this is.
  it("is written to be true at every width", () => {
    render(<ActivityInputHint activity={getActivity("leetype")} />)
    const hint = screen.getByText(/typing on a keyboard/i)
    expect(hint.textContent).not.toMatch(
      /this device|your screen|currently|right now/i
    )
  })

  // The old description ("…by typing the smallest code that shows it") was
  // simply false on a phone once the small-screen surface stopped being a
  // typing exercise. This is the tripwire for it, or anything like it,
  // coming back on any activity that has more than one modality.
  it("keeps a dual-modality activity's description modality-neutral", () => {
    for (const id of ACTIVITY_IDS) {
      const activity = getActivity(id)
      if (!activity.input?.switchesOnSmallScreens) continue
      expect(activity.description).not.toMatch(/\btyping\b|\btype\b|\btap\b/i)
    }
  })
})
