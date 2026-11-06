/**
 * What `Notice` owns that jsdom can see: it says its words on the plane, out
 * of the screen it was rendered in, and leaves with its mount.
 */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Notice, NoticeLayer } from "."

describe("Notice", () => {
  it("speaks on its layer's plane, not where it is rendered", () => {
    const { container, unmount } = render(
      <NoticeLayer>
        <section aria-label="screen">
          <Notice role="alert">Not saved</Notice>
        </section>
      </NoticeLayer>
    )
    const alert = screen.getByRole("alert")
    expect(alert.closest("[data-notice-plane]")).not.toBeNull()
    expect(container.querySelector("section")?.textContent).toBe("")
    unmount()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("makes a plane at the top of the page under no layer", () => {
    render(<Notice>Saved</Notice>)
    expect(
      screen.getByRole("status").closest("[data-notice-plane]")?.parentElement
    ).toBe(document.body)
  })
})
