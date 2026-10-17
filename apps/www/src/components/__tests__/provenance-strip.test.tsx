/**
 * @vitest-environment jsdom
 *
 * One screen, two readings (CLAUDE.md): the owner reads what the wing
 * publishes and keeps; a viewer on the Pages build reads that this is sample
 * data and nothing is kept.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const viewer = vi.hoisted(() => ({ build: false }))

vi.mock("@/lib/data-mode", () => ({
  get VIEWER_BUILD(): boolean {
    return viewer.build
  },
}))

const { ProvenanceStrip } = await import("@/components/provenance-strip")

const EXPOSURE = { published: "the screens", private: "my sessions" }

afterEach(() => {
  cleanup()
  viewer.build = false
})

describe("ProvenanceStrip", () => {
  it("tells the owner what is published and what is kept", () => {
    render(<ProvenanceStrip exposure={EXPOSURE} />)
    expect(screen.getByText("Published: the screens")).toBeTruthy()
    expect(screen.getByText("Private: my sessions")).toBeTruthy()
  })

  it("tells a viewer this is sample data that nothing keeps", () => {
    viewer.build = true
    render(<ProvenanceStrip exposure={EXPOSURE} />)
    expect(screen.getByRole("note").textContent).toContain(
      "nothing you do is kept"
    )
    expect(screen.queryByText(/^Private:/)).toBeNull()
  })
})
