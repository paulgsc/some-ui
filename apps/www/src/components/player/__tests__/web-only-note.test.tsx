/**
 * @vitest-environment jsdom
 */

import type { RegistryEntry } from "@some-ui/types"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { withWebOnlyNotes } from "@/components/player/web-only-note"

afterEach(cleanup)

describe("withWebOnlyNotes", () => {
  it("says where an unbound web panel is played", () => {
    const { hangul } = withWebOnlyNotes({}, ["hangul"])

    render(<hangul.Component />)

    expect(
      screen.getByText("Hangul Honeycomb is played on the desktop web.")
    ).toBeDefined()
  })

  it("leaves a bound panel as it is", () => {
    const bound: RegistryEntry = {
      Component: (): null => null,
      preload: () => Promise.resolve({ default: (): null => null }),
    }

    expect(withWebOnlyNotes({ hangul: bound }, ["hangul"]).hangul).toBe(bound)
  })
})
