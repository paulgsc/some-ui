/**
 * @vitest-environment jsdom
 *
 * The shell by wing (lib/wings): the bar holds the current wing's rooms and
 * none of another's; where it steps aside (the composer), the header leads
 * back to the wing's Home, without which the composer could only be left by
 * finishing it; elsewhere the header leads to the foyer.
 */

import type * as ReactRouterModule from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
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

const { MobileNav, MobileSettingsLink, MobileWayOut } = await import(
  "@/components/mobile-shell"
)

afterEach(() => {
  cleanup()
  carriesApk = true
})

/** Where a rendered link points: the stub `Link` keeps `to` as an attribute. */
function targetOf(text: string): string | null | undefined {
  return screen.getByText(text).closest("a")?.getAttribute("to")
}

describe("MobileNav", () => {
  it("holds Practice's rooms and nothing of another wing", () => {
    render(<MobileNav pathname="/sessions" />)

    expect(targetOf("Home")).toBe("/practice")
    expect(targetOf("Study")).toBe("/sessions")
    expect(targetOf("Bites")).toBe("/soundbites")
    expect(screen.queryByText("aph")).toBeNull()
    expect(
      screen.getByText("Study").closest("a")?.getAttribute("aria-current")
    ).toBe("page")
  })

  it("has no bar in a wing of one room, or outside every wing", () => {
    for (const pathname of ["/aph", "/journal", "/foyer", "/settings"]) {
      const { container } = render(<MobileNav pathname={pathname} />)
      expect(container.querySelector("nav"), pathname).toBeNull()
      cleanup()
    }
  })
})

describe("MobileWayOut", () => {
  it("leads back to the wing's Home where the bar steps aside", () => {
    render(<MobileWayOut pathname="/sessions/new" bounded />)

    expect(targetOf("Practice")).toBe("/practice")
  })

  it("leads to the foyer elsewhere, and is absent on the foyer itself", () => {
    render(<MobileWayOut pathname="/aph/history" bounded={false} />)
    expect(
      screen.getByLabelText("Self: choose another wing").getAttribute("to")
    ).toBe("/foyer")
    cleanup()

    const { container } = render(
      <MobileWayOut pathname="/foyer" bounded={false} />
    )
    expect(container.querySelector("a")).toBeNull()
  })

  it("renders nothing in a build without the phone's pages (A3)", () => {
    carriesApk = false
    const { container } = render(
      <MobileWayOut pathname="/sessions/new" bounded />
    )

    expect(container.querySelector("a")).toBeNull()
  })
})

describe("MobileSettingsLink", () => {
  it("opens the wing's own settings, or the front desk from the foyer", () => {
    render(<MobileSettingsLink pathname="/practice" />)
    expect(screen.getByLabelText("Practice settings").getAttribute("to")).toBe(
      "/practice/settings"
    )
    cleanup()

    render(<MobileSettingsLink pathname="/foyer" />)
    expect(screen.getByLabelText("Settings").getAttribute("to")).toBe(
      "/settings"
    )
  })

  it("is absent where a wing has no settings, and on the page it opens", () => {
    for (const pathname of ["/journal", "/practice/settings", "/settings"]) {
      const { container } = render(<MobileSettingsLink pathname={pathname} />)
      expect(container.querySelector("a"), pathname).toBeNull()
      cleanup()
    }
  })
})
