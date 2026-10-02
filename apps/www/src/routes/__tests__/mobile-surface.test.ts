/**
 * @vitest-environment jsdom
 *
 * The Android app carries sessions, the soundbites and settings, and nothing
 * else www routes to (`lib/app-surface`). Checked against the real route tree, in a bundle
 * built with the real `mobile` profile's name: every route either loads where
 * it was asked for, or ends on the sessions list. The profile name comes from
 * build.profiles.ts, so a `lib/build-profile` that spells it differently turns
 * the guard off and fails here.
 *
 * A route added to www later is off the phone by default, and this suite
 * probes it without being touched: it walks the tree rather than a list.
 */

import { QueryClient } from "@tanstack/react-query"
import type { AnyRouter } from "@tanstack/react-router"
import { createMemoryHistory, createRouter } from "@tanstack/react-router"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { isOnMobileSurface, MOBILE_HOME } from "@/lib/app-surface"

vi.mock("virtual:build-profile", async () => {
  const { MOBILE_PROFILE, profiles } = await import("@/build.profiles")
  // The real profile's audiences, so a page gated to one of them (the
  // soundbites, "apk") loads here as it does on the phone.
  const { audiences } = profiles[MOBILE_PROFILE]
  return {
    profile: MOBILE_PROFILE,
    audiences,
    hasAudience: (audience: string): boolean =>
      audiences.some((carried) => carried === audience),
  }
})

// The phone is always signed in (the device backend's `/auth/session`).
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasSession: (): boolean => true,
  resolveSession: (): Promise<boolean> => Promise.resolve(true),
}))

let routeTree: AnyRouter["routeTree"]
let urls: Array<string>

/** A URL that matches `fullPath`, with every param and splat filled in. */
function probeUrl(fullPath: string): string {
  return fullPath.replace(/\$[^/]*/g, "probe").replace(/(.)\/$/, "$1")
}

async function landingOf(url: string): Promise<string> {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient: new QueryClient() },
  })
  await router.load()
  return router.state.location.pathname
}

beforeAll(async () => {
  // Loaders prefetch from `file_host`; nothing here should reach a network.
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline in tests")))
  routeTree = (await import("@/routeTree.gen")).routeTree
  const routes: Array<{ fullPath: string }> = Object.values(
    createRouter({ routeTree }).routesById
  )
  urls = [...new Set(routes.map((r) => probeUrl(r.fullPath)))]
})

describe("the Android app's surface", () => {
  it("probes both sides of the line", () => {
    // Guards the suite against passing having probed nothing on one side.
    expect(urls.filter(isOnMobileSurface).length).toBeGreaterThan(2)
    expect(urls.filter((u) => !isOnMobileSurface(u))).toEqual(
      expect.arrayContaining(["/", "/app", "/resume"])
    )
  })

  it("opens a route on the surface where it was asked for", async () => {
    for (const url of urls.filter(isOnMobileSurface)) {
      expect(await landingOf(url), url).toBe(url)
    }
  })

  it("sends every other route to the sessions list", async () => {
    for (const url of urls.filter((u) => !isOnMobileSurface(u))) {
      expect(await landingOf(url), url).toBe(MOBILE_HOME)
    }
  })

  it("never redirects a signed-out visit away from sign-in", () => {
    // The root sends a signed-out visit to /auth; off the surface, that would
    // be sent back to /sessions, and round again.
    expect(isOnMobileSurface("/auth")).toBe(true)
  })

  it("matches whole path segments only", () => {
    expect(isOnMobileSurface("/sessions")).toBe(true)
    expect(isOnMobileSurface("/sessions/new")).toBe(true)
    expect(isOnMobileSurface("/sessions/")).toBe(true)
    expect(isOnMobileSurface("/sessionsx")).toBe(false)
    expect(isOnMobileSurface("/settings-old")).toBe(false)
    expect(isOnMobileSurface("/")).toBe(false)
  })
})
