/**
 * What `Reserved` keeps in jsdom, which has no layout: the live region and
 * its room are there whether a message is or not, and only the paint is
 * conditional. That the room is enough at a phone's width is measured where
 * there is layout (`apps/www/tests/ui-fit/stays-put.spec.ts`, HS1).
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Reserved } from "."

describe("Reserved", () => {
  it.each([
    ["nothing", null],
    ["a message", "Not saved: the phone did not keep it."],
  ])("keeps its live region and its room with %s in it", (_, message) => {
    render(
      <Reserved role="alert" lines={2} shownClassName="bg-warning/10">
        {message}
      </Reserved>
    )
    const region = screen.getByRole("alert")
    expect(region.firstElementChild).toHaveStyle({ minHeight: "2lh" })
    expect(region.classList.contains("bg-warning/10")).toBe(message !== null)
    expect(region).toHaveTextContent(message ?? "")
  })

  it("treats false as nothing, so `{refused && …}` reads as it does in JSX", () => {
    render(
      <Reserved role="status" shownClassName="bg-warning/10">
        {false}
      </Reserved>
    )
    expect(screen.getByRole("status")).not.toHaveClass("bg-warning/10")
  })
})
