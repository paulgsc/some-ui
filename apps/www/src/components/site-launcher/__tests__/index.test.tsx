/**
 * @vitest-environment jsdom
 *
 * The launcher offers each build exactly the pages it serves and its
 * navigation offers: no LAN tool where "lan" is not bundled (A3,
 * packages/some-vite-config/AUDIENCES.md), administration first and no study
 * or making on the home network (ADM1, `lib/purpose`), Playoff Delta on the
 * public site, and nothing in the Android app.
 */

import type { JSX, ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ShieldCheck } from "lucide-react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as SiteMap from "@/lib/site-map"
import type { Destination } from "@/lib/site-map"
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
  catalog,
}: {
  audiences: ReadonlyArray<string>
  mobile?: boolean
  kind?: "local" | "account" | "pending"
  /** Stands in for the site map's destinations, when a case needs its own. */
  catalog?: ReadonlyArray<Destination>
}): Promise<typeof Launcher> {
  vi.resetModules()
  if (catalog) {
    const actual = await vi.importActual<typeof SiteMap>("@/lib/site-map")
    vi.doMock("@/lib/site-map", () => ({
      ...actual,
      destinationsHere: (): ReadonlyArray<Destination> => catalog,
    }))
  }
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
  vi.doUnmock("@/lib/site-map")
  vi.resetModules()
})

describe("the site launcher", () => {
  it("offers the LAN build how it's running first, then the showcase, and no study or making", async () => {
    const { SiteLauncher } = await load({
      audiences: ["public", "lan", "web"],
    })
    render(<SiteLauncher />)
    expect(openTiles()).toEqual(["/assurance", "/extensions", "/mission"])
    expect(screen.getByText("How it's running")).toBeTruthy()
    expect(screen.queryByText("Home network")).toBeNull()
  })

  it("marks a LAN tool as needing a passkey until the account is the authority", async () => {
    // No LAN page is offered today; CHECKS' "Is it working?" (CK8, #2388)
    // will be the first, so the case stands on a catalog of its own.
    const catalog: ReadonlyArray<Destination> = [
      {
        to: "/lessons",
        title: "A LAN page",
        blurb: "Behind the passkey.",
        icon: ShieldCheck,
        audience: "lan",
        purpose: "administration",
        launcher: "running",
      },
    ]
    const signedOut = await load({
      audiences: ["public", "lan", "web"],
      catalog,
    })
    render(<signedOut.SiteLauncher />)
    openTiles()
    expect(screen.getAllByText("Passkey")).toHaveLength(1)
    cleanup()

    const signedIn = await load({
      audiences: ["public", "lan", "web"],
      kind: "account",
      catalog,
    })
    render(<signedIn.SiteLauncher />)
    openTiles()
    expect(screen.queryByText("Passkey")).toBeNull()
  })

  it("offers the public site Playoff Delta, no LAN tool and no administration, as before ADM1", async () => {
    const { SiteLauncher } = await load({ audiences: ["public", "web"] })
    render(<SiteLauncher />)
    expect(openTiles()).toEqual(["/playoff-delta", "/extensions", "/mission"])
    expect(screen.queryByText("Home network")).toBeNull()
    expect(screen.queryByText("How it's running")).toBeNull()
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
