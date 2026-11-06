/**
 * What `Reserved` owns that jsdom can see: its live region is mounted with
 * nothing in it, so a screen reader hears what lands there later. That the
 * room is enough at a phone's width is measured where there is layout
 * (`apps/www/tests/ui-fit/stays-put.spec.ts`, HS1).
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Reserved } from "."

describe("Reserved", () => {
  it.each([null, false, "Not saved: the phone did not keep it."])(
    "keeps its live region mounted with %s in it",
    (message) => {
      render(<Reserved role="alert">{message}</Reserved>)
      expect(screen.getByRole("alert")).toBeInTheDocument()
    }
  )
})
