/**
 * @vitest-environment jsdom
 *
 * The Android app carries its foyer and its wings (Practice, Self, Studio)
 * and the front desk, and nothing else (`lib/app-surface`, `lib/wings`). Checked against the real
 * route tree with the real `mobile` profile name (from build.profiles.ts, so
 * a misspelling in `lib/build-profile` fails here): every route loads where
 * asked, or ends on the phone's foyer. It walks the tree, so a route added
 * later is probed without touching this suite.
 */

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { MOBILE_ROUTE_FILES } from "@/build.paths"
import { globToRegExp } from "@some-ui/vite-config/bundle-paths"
import { QueryClient } from "@tanstack/react-query"
import type { AnyRouter } from "@tanstack/react-router"
import { createMemoryHistory, createRouter } from "@tanstack/react-router"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { isOnMobileSurface, MOBILE_ENTRY } from "@/lib/app-surface"
import { WINGS } from "@/lib/wings"
import { ENTRY_ROOTS } from "@/lib/wings/entry"

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

  it("sends every other route to the phone's foyer", async () => {
    for (const url of urls.filter((u) => !isOnMobileSurface(u))) {
      expect(await landingOf(url), url).toBe(MOBILE_ENTRY)
    }
  })

  it("carries every root a launcher icon may open", () => {
    for (const root of ENTRY_ROOTS)
      expect(isOnMobileSurface(root), root).toBe(true)
  })

  it("ships exactly the route files on the surface (build.paths.ts)", () => {
    // The surface's routes and the layouts above them: the files the APK
    // may carry (build.paths.ts), derived from the tree so the declared
    // list cannot drift from `MOBILE_SURFACE`.
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
    // The account banner links a signed-out visit to /auth, which in this
    // build offers a reload; off the surface, it would be sent to Home first.
    expect(isOnMobileSurface("/auth")).toBe(true)
  })

  // Nothing on a PR builds the APK, so what MainActivity, the manifest and
  // the review's policy must agree on with www is checked here, from source.
  describe("the launcher icons (apps/mobile)", () => {
    const android = resolve(import.meta.dirname, "../../../../mobile")
    const read = (path: string): string =>
      readFileSync(resolve(android, path), "utf8")
    const activity = read(
      "android/app/src/main/java/dev/paulgsc/someui/MainActivity.java"
    )
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    const policy = read("review/policy.json")

    /** MainActivity's fixed table: alias name to the root it opens. */
    const table = new Map(
      [...activity.matchAll(/case "(Wing\w+)": return "(\/[^"]*)";/g)].map(
        ([, alias = "", root = ""]) => [alias, root]
      )
    )
    /** Every launcher alias the manifest declares, and what it targets. */
    const aliases = [
      ...manifest.matchAll(/<activity-alias\b[\s\S]*?<\/activity-alias>/g),
    ].map(([block]) => ({
      name: /android:name="\.?([\w.]+)"/.exec(block)?.[1] ?? "",
      target: /android:targetActivity="([^"]+)"/.exec(block)?.[1] ?? "",
      launcher: block.includes("android.intent.category.LAUNCHER"),
    }))

    it("opens the plain icon on the foyer, as www does", () => {
      expect(activity).toContain(`FOYER_PATH = "${MOBILE_ENTRY}";`)
    })

    it("maps each wing with a Home to its own alias, and nothing else", () => {
      const expected = WINGS.flatMap((wing) =>
        wing.home === null
          ? []
          : [
              [
                `Wing${wing.id.charAt(0).toUpperCase()}${wing.id.slice(1)}`,
                wing.home,
              ],
            ]
      )
      expect([...table.entries()].sort()).toEqual(expected.sort())
      expect(new Set(table.values())).toEqual(
        new Set(ENTRY_ROOTS.filter((root) => root !== MOBILE_ENTRY))
      )
    })

    it("declares every alias in the table as a launcher icon onto MainActivity, and no other", () => {
      expect(aliases.map((alias) => alias.name).sort()).toEqual(
        [...table.keys()].sort()
      )
      for (const alias of aliases) {
        expect(alias.target, alias.name).toBe(".MainActivity")
        expect(alias.launcher, alias.name).toBe(true)
      }
    })

    it("gives the review a reason for each alias it exports", () => {
      for (const name of table.keys()) expect(policy).toContain(`.${name}"`)
    })
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
