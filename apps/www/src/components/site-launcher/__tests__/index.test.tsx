/**
 * @vitest-environment jsdom
 *
 * The launcher offers each build exactly the pages it serves: the LAN tools
 * only where "lan" is bundled (A3, packages/some-vite-config/AUDIENCES.md),
 * Playoff Delta only where "web" is, and nothing in the Android app.
 */

import type { JSX, ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as Launcher from "@/components/site-launcher"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
  }: {
    to: string
    children: ReactNode
  }): JSX.Element => <a href={to}>{children}</a>,
}))

async function load({
  audiences,
  mobile = false,
  kind = "local",
}: {
  audiences: ReadonlyArray<string>
  mobile?: boolean
  kind?: "local" | "account" | "pending"
}): Promise<typeof Launcher> {
  vi.resetModules()
  vi.doMock("@/lib/build-profile", () => ({
    MOBILE_APP: mobile,
    hasAudience: (audience: string): boolean => audiences.includes(audience),
  }))
  vi.doMock("@/lib/authority", () => ({
    useAuthority: (): { kind: string } => ({ kind }),
  }))
  return import("@/components/site-launcher")
}

/** Opens the launcher and returns the href of every tile, in order. */
function openTiles(): Array<string | null> {
  fireEvent.click(screen.getByRole("button", { name: /explore/i }))
  return screen.getAllByRole("link").map((a) => a.getAttribute("href"))
}

afterEach(() => {
  cleanup()
  vi.doUnmock("@/lib/build-profile")
  vi.doUnmock("@/lib/authority")
  vi.resetModules()
})

describe("the site launcher", () => {
  it("offers the LAN build its tools first, then the showcase", async () => {
    const { SiteLauncher } = await load({
      audiences: ["public", "lan", "web"],
    })
    render(<SiteLauncher />)
    expect(openTiles()).toEqual([
      "/lessons",
      "/resume-build",
      "/playoff-delta",
      "/extensions",
      "/mission",
    ])
    expect(screen.getByText("Home network")).toBeTruthy()
  })

  it("marks a LAN tool as needing a passkey until the account is the authority", async () => {
    const signedOut = await load({ audiences: ["public", "lan", "web"] })
    render(<signedOut.SiteLauncher />)
    openTiles()
    expect(screen.getAllByText("Passkey")).toHaveLength(2)
    cleanup()

    const signedIn = await load({
      audiences: ["public", "lan", "web"],
      kind: "account",
    })
    render(<signedIn.SiteLauncher />)
    openTiles()
    expect(screen.queryByText("Passkey")).toBeNull()
  })

  it("offers the public site Playoff Delta and no LAN tool", async () => {
    const { SiteLauncher } = await load({ audiences: ["public", "web"] })
    render(<SiteLauncher />)
    expect(openTiles()).toEqual(["/playoff-delta", "/extensions", "/mission"])
    expect(screen.queryByText("Home network")).toBeNull()
  })

  it("renders nothing in the Android app", async () => {
    const { SiteLauncher } = await load({
      audiences: ["public", "apk"],
      mobile: true,
    })
    const { container } = render(<SiteLauncher />)
    expect(container.innerHTML).toBe("")
  })
})
