/**
 * What `Notice` owns that jsdom can see: it says its words on the plane, out
 * of the screen it was rendered in; a dismissible one stays closed until it
 * is said anew; its action calls back; its role follows its tone.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Notice, NoticeLayer } from "."

describe("Notice", () => {
  it("speaks on its layer's plane, not where it is rendered", () => {
    const { container } = render(
      <NoticeLayer>
        <section aria-label="screen">
          <Notice role="alert">Not saved</Notice>
        </section>
      </NoticeLayer>
    )
    expect(
      screen.getByRole("alert").closest("[data-notice-plane]")
    ).not.toBeNull()
    expect(container.querySelector("section")?.textContent).toBe("")
  })

  it("makes a plane at the top of the page under no layer", () => {
    render(<Notice>Saved</Notice>)
    expect(
      screen.getByRole("status").closest("[data-notice-plane]")?.parentElement
    ).toBe(document.body)
  })

  it("stays closed for its key, and says a new key again", () => {
    const { rerender } = render(
      <Notice key="first" dismissible>
        First
      </Notice>
    )
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByText("First")).toBeNull()
    rerender(
      <Notice key="first" dismissible>
        First
      </Notice>
    )
    expect(screen.queryByText("First")).toBeNull()
    rerender(
      <Notice key="second" dismissible>
        Second
      </Notice>
    )
    screen.getByText("Second")
  })

  it("calls its onDismiss and its action back", () => {
    const onDismiss = vi.fn()
    const onClick = vi.fn()
    render(
      <Notice onDismiss={onDismiss} action={{ label: "Again", onClick }}>
        Not read
      </Notice>
    )
    fireEvent.click(screen.getByRole("button", { name: "Again" }))
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("is an alert in danger and a status otherwise, unless told", () => {
    render(
      <>
        <Notice tone="danger">Refused</Notice>
        <Notice tone="warning">Typo?</Notice>
        <Notice tone="danger" role="status">
          Counting
        </Notice>
      </>
    )
    expect(screen.getByRole("alert").textContent).toBe("Refused")
    expect(screen.getAllByRole("status").map((n) => n.textContent)).toEqual([
      "Typo?",
      "Counting",
    ])
  })
})
