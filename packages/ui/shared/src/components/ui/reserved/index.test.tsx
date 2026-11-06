/**
 * What `Reserved` and its kin own that jsdom can see: a live region is
 * mounted with nothing in it, so a screen reader hears what lands there
 * later, and what `Held` keeps unshown is out of reach. That the
 * room is enough at a phone's width is measured where there is layout
 * (`apps/www/tests/ui-fit/stays-put.spec.ts`, HS1).
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AlertOrStatus, Held, Reserved, SameWidth } from "."

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

  it("says a refusal or advice in one room, both regions mounted", () => {
    const { rerender } = render(<AlertOrStatus status="Kept." />)
    expect(screen.getByRole("status")).toHaveTextContent(/^Kept\.$/)
    expect(screen.getByRole("alert")).toHaveTextContent(/^$/)
    rerender(<AlertOrStatus alert="Not kept." status="Kept." />)
    expect(screen.getByRole("alert")).toHaveTextContent(/^Not kept\.$/)
    expect(screen.getByRole("status")).toHaveTextContent(/^$/)
  })

  it.each([true, false])("holds what it keeps, shown %s", (shown) => {
    render(
      <Held shown={shown}>
        <button type="button">Show English</button>
      </Held>
    )
    expect(
      screen.queryByRole("button", { name: "Show English" }) !== null
    ).toBe(shown)
    const held = screen.getByText("Show English").parentElement
    expect(held?.hasAttribute("inert")).toBe(!shown)
  })
})
