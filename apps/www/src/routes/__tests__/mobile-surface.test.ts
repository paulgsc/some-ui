/**
 * @vitest-environment jsdom
 *
 * The Android app carries its Home, sessions, the soundbites, aph and
 * settings, and nothing else www routes to (`lib/app-surface`). Checked against the real route tree, in a bundle
 * built with the real `mobile` profile's name: every route either loads where
 * it was asked for, or ends on the phone's Home. The profile name comes from
 * build.profiles.ts, so a `lib/build-profile` that spells it differently turns
 * the guard off and fails here.
 *
 * A route added to www later is off the phone by default, and this suite
 * probes it without being touched: it walks the tree rather than a list.
 */

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { MOBILE_ROUTE_FILES } from "@/build.paths"
import { globToRegExp } from "@some-ui/vite-config/bundle-paths"
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

type RouteNode = {
  id: string
  fullPath: string
  parentRoute?: RouteNode
}
let routes: Array<RouteNode>

/** The file under src/routes a route id comes from, as build rules name it. */
function routeFile(id: string): string {
  const path =
    id === "__root__" ? "/__root" : id.endsWith("/") ? `${id}index` : id
  return `apps/www/src/routes${path}.tsx`
}

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
  routes = Object.values(createRouter({ routeTree }).routesById)
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

  it("sends every other route to the phone's Home", async () => {
    for (const url of urls.filter((u) => !isOnMobileSurface(u))) {
      expect(await landingOf(url), url).toBe(MOBILE_HOME)
    }
  })

  it("ships exactly the route files on the surface (build.paths.ts)", () => {
    // The surface's routes and every layout above them: the files the APK
    // build may carry (build.paths.ts, checked against the real build by
    // `check:bundle-paths`). Derived here from the tree, so the declared list
    // cannot drift from `MOBILE_SURFACE` in either direction.
    const onSurface = new Set<string>()
    for (const route of routes) {
      if (!isOnMobileSurface(probeUrl(route.fullPath))) continue
      for (let r: RouteNode | undefined = route; r; r = r.parentRoute) {
        onSurface.add(routeFile(r.id))
      }
    }
    const declared = MOBILE_ROUTE_FILES.map((glob) => globToRegExp(glob))
    for (const route of routes) {
      const file = routeFile(route.id)
      expect(
        existsSync(resolve(import.meta.dirname, "../../../../..", file)),
        file
      ).toBe(true)
      expect(
        declared.some((re) => re.test(file)),
        file
      ).toBe(onSurface.has(file))
    }
  })

  it("never redirects a signed-out visit away from sign-in", () => {
    // The root sends a signed-out visit to /auth; off the surface, that would
    // be sent back to Home, and round again.
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
