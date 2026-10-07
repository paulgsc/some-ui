/**
 * @vitest-environment jsdom
 *
 * Where the bottom bar steps aside (the composer), the header's Home link is
 * the visible way out: without it, the composer could only be left by
 * finishing it.
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

const { MobileHomeLink } = await import("@/components/mobile-shell")

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
