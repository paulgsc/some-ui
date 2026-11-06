/**
 * What `Reserved` owns that jsdom can see: its live region is mounted with
 * nothing in it, so a screen reader hears what lands there later. That the
 * room is enough at a phone's width is measured where there is layout
 * (`apps/www/tests/ui-fit/stays-put.spec.ts`, HS1).
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Reserved, SameWidth } from "."

describe("Reserved", () => {
  it.each([null, false, "Not saved: the phone did not keep it."])(
    "keeps its live region mounted with %s in it",
    (message) => {
      render(<Reserved role="alert">{message}</Reserved>)
      expect(screen.getByRole("alert")).toBeInTheDocument()
    }
  )

  it("keeps room for each line it may say, none of them read as its text", () => {
    const fits = ["On.", "Off: home sends nothing to this phone."]
    render(
      <Reserved role="status" fits={fits}>
        On.
      </Reserved>
    )
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent(/^On\.$/)
    expect(status.querySelectorAll("[data-fits]")).toHaveLength(fits.length)
  })

  it("shows one word, the others it may say drawn only as room", () => {
    render(
      <button type="button">
        <SameWidth every={["Copy", "Copying…", "Copied"]}>Copied</SameWidth>
      </button>
    )
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument()
    expect(screen.queryByText("Copying…")).toBeNull()
  })
})
