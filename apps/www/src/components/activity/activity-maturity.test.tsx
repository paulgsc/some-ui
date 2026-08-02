/**
 * @vitest-environment jsdom
 *
 * The sign has to appear where it is needed and stay away where it isn't -
 * a badge on every card is a badge on none of them.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { getActivity } from "@some-ui/activity-catalog"

import {
  ActivityMaturityBadge,
  ActivityMaturityNote,
} from "./activity-maturity"

afterEach(() => {
  cleanup()
})

describe("activity maturity signs", () => {
  it("says nothing at all for a finished activity", () => {
    const { container } = render(
      <ActivityMaturityBadge activity={getActivity("honeycomb")} />
    )

    // Silence is what gives the other two states their meaning.
    expect(container.textContent).toBe("")
  })

  it("marks an activity that works but is still rough", () => {
    render(<ActivityMaturityBadge activity={getActivity("topik")} />)

    expect(screen.getByText("Preview")).toBeDefined()
  })

  it("marks a construction zone before a person walks into it", () => {
    render(<ActivityMaturityNote activity={getActivity("interview")} />)

    expect(screen.getByText(/under construction/i)).toBeDefined()
  })

  it("sets expectations without exposing anything about the build", () => {
    render(<ActivityMaturityNote activity={getActivity("interview")} />)

    // Not a diagnostic and not an apology: no error text, no issue numbers,
    // no roadmap, nothing a person would have to be an engineer to read.
    const note = screen.getByText(/under construction/i).textContent
    expect(note).not.toMatch(/error|bug|issue|#\d|TODO|WIP|broken|fix/i)
  })
})
