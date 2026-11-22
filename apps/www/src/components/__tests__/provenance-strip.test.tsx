/**
 * @vitest-environment jsdom
 *
 * One screen, two readings (CLAUDE.md): the owner reads what the wing
 * keeps; a viewer in the viewer build reads that this is sample
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

const EXPOSURE = { private: "my sessions" }

afterEach(() => {
  cleanup()
  viewer.build = false
})

describe("ProvenanceStrip", () => {
  it("tells the owner what is kept, and claims nothing published", () => {
    render(<ProvenanceStrip exposure={EXPOSURE} />)
    expect(screen.getByText("Private: my sessions")).toBeTruthy()
    expect(screen.queryByText(/^Published:/)).toBeNull()
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
