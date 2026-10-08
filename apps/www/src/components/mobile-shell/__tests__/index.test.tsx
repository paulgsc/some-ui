/**
 * @vitest-environment jsdom
 *
 * Where the bottom bar steps aside (the composer), the header's Home link is
 * the visible way out: without it, the composer could only be left by
 * finishing it. And Android's back, which changes the page under the + sheet,
 * must not leave the sheet open over a page it was not opened on.
 */

import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as BuildProfileModule from "@/lib/build-profile"

let carriesApk = true

vi.mock(
  "@/lib/build-profile",
  async (importOriginal): Promise<typeof BuildProfileModule> => ({
    ...(await importOriginal<typeof BuildProfileModule>()),
    hasAudience: (audience) => audience === "apk" && carriesApk,
  })
)

vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

const { MobileHomeLink, MobileNav } = await import("@/components/mobile-shell")

afterEach(() => {
  cleanup()
  carriesApk = true
})

describe("MobileHomeLink", () => {
  it("links to the phone's Home", () => {
    render(<MobileHomeLink />)

    // The stub `Link` is an `<a>` with no href, so no "link" role to query.
    expect(screen.getByText("Home").closest("a")?.getAttribute("to")).toBe(
      "/today"
    )
  })

  it("renders nothing in a build without the phone's pages (A3)", () => {
    carriesApk = false
    render(<MobileHomeLink />)

    expect(screen.queryByText("Home")).toBeNull()
  })
})

describe("MobileNav's + sheet", () => {
  it("closes when the page under it changes, and stays closed on return", () => {
    const { rerender } = render(<MobileNav pathname="/today" />)
    fireEvent.click(screen.getByRole("button", { name: "Quick entry" }))
    expect(screen.getByRole("dialog")).toBeTruthy()

    // Android's back, with the sheet open.
    rerender(<MobileNav pathname="/sessions" />)
    expect(screen.queryByRole("dialog")).toBeNull()

    rerender(<MobileNav pathname="/today" />)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
