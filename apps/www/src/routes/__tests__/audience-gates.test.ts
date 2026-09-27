/**
 * @vitest-environment jsdom
 *
 * Every route under an audience gate resolves to not-found in a build that
 * leaves the audience out - checked against the real route tree, not a model
 * of it.
 *
 * A build without an audience stubs that audience's workspaces: each export
 * becomes a function that throws when called (packages/some-vite-config,
 * `audiencePlugin`). The gate layout's `beforeLoad` then has to turn a visit
 * into not-found before anything reaches a stub. Two things can break that,
 * and neither shows up in a `lan` build, which is the one people run:
 *
 * - the gate and its guard drift apart: `gates` in build.profiles.ts names a
 *   directory whose layout no longer calls `requireAudience`, or a route moves
 *   out from under it;
 * - a route calls a stub in code the router runs *before* the parent guard.
 *   Measured on @tanstack/react-router 1.170: a throwing `validateSearch` or
 *   `params.parse` is recorded and the guard's not-found still wins, but a
 *   throwing `loaderDeps`, `search.middlewares` or `context` fails matching
 *   before the guard runs. That the first two are tolerated is itself pinned
 *   below, so a router upgrade that changes it fails here.
 *
 * It also scans www's source outside the gates for links to a gated path: a
 * file that has one must import `hasAudience`, so a public build never offers
 * a link to a page it answers with not-found. The gated paths come from the
 * route tree, so moving a page under a gate or adding a gate directory is
 * checked against every existing link without either of them being touched.
 *
 * What this cannot see: a stub reached only on a branch the probe URL does not
 * take (a search param it does not set), and a link that sits outside the
 * `hasAudience` branch of a file that does check. Those are invariants A1 and
 * A3 in packages/some-vite-config/AUDIENCES.md.
 */

import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { gates, workspaceRoots } from "@/build.profiles"
import { readAudienceWorkspaces } from "@some-ui/vite-config/audience"
import { QueryClient } from "@tanstack/react-query"
import type { AnyRouter } from "@tanstack/react-router"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  Outlet,
} from "@tanstack/react-router"
import { beforeAll, describe, expect, it, vi } from "vitest"

const build = vi.hoisted(() => ({ audiences: new Set<string>(["public"]) }))

vi.mock("virtual:build-profile", () => ({
  profile: "audience-gates-test",
  audiences: [],
  hasAudience: (audience: string): boolean => build.audiences.has(audience),
}))

// The root layout sends a signed-out visit to /auth before any gate runs.
vi.mock("@/lib/auth-session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasDecorativeSession: (): boolean => true,
}))

/** What `audiencePlugin` serves in place of an excluded workspace. */
function stubbedWorkspace(name: string): object {
  const excluded = (): never => {
    throw new Error(`${name} is stubbed out of this build`)
  }
  return new Proxy(
    {},
    {
      has: (): boolean => true,
      get: (_target, key): unknown =>
        typeof key === "symbol" || key === "then" ? undefined : excluded,
    }
  )
}

type Gate = {
  audience: string
  routeId: string
  dir: string
  /** The gated routes' paths as a `to` names them, params unfilled. */
  paths: Array<string>
  urls: Array<string>
}

const APP_ROOT = resolve(import.meta.dirname, "../../..")

/** Every .ts/.tsx file under `dir`, as paths relative to the app root. */
function sourceFiles(dir: string): Array<string> {
  return readdirSync(join(APP_ROOT, dir), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => relative(APP_ROOT, join(e.parentPath, e.name)))
}

/** Whether `source` names `path` as a whole quoted string: `"/lan"`, `'/lan'`. */
function namesPath(source: string, path: string): boolean {
  const quoted = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(["'\`])${quoted}\\1`).test(source)
}

const IMPORTS_HAS_AUDIENCE =
  /import\s*\{[^}]*\bhasAudience\b[^}]*\}\s*from\s*["']@\/lib\/build-profile["']/

let routeTree: AnyRouter["routeTree"]
let gated: Array<Gate>

/** A URL that matches `fullPath`, with every param and splat filled in. */
function probeUrl(fullPath: string): string {
  const path = fullPath.replace(/\$[^/]*/g, "probe").replace(/\/$/, "") || "/"
  return `${path}?probe=1`
}

async function gateStatusAt(url: string): Promise<Map<string, string>> {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient: new QueryClient() },
  })
  await router.load()
  return new Map(router.state.matches.map((m) => [m.routeId, m.status]))
}

beforeAll(async () => {
  const { workspaces } = readAudienceWorkspaces(workspaceRoots)
  for (const w of workspaces) {
    if (w.audience !== "public")
      vi.doMock(w.name, () => stubbedWorkspace(w.name))
  }
  routeTree = (await import("@/routeTree.gen")).routeTree

  const routes: Array<{ id: string; fullPath: string }> = Object.values(
    createRouter({ routeTree }).routesById
  )
  gated = Object.entries(gates).flatMap(([audience, dirs]) =>
    dirs.map((dir) => {
      const routeId = dir.replace(/^src\/routes/, "")
      const children = routes.filter((r) => r.id.startsWith(`${routeId}/`))
      return {
        audience,
        routeId: routes.some((r) => r.id === routeId)
          ? routeId
          : `(no layout route for ${dir})`,
        dir,
        paths: [
          ...new Set(children.map((r) => r.fullPath.replace(/(.)\/$/, "$1"))),
        ],
        urls: [...new Set(children.map((r) => probeUrl(r.fullPath)))],
      }
    })
  )
})

describe("audience gates", () => {
  it("each gate directory is a layout route with routes under it", () => {
    for (const gate of gated) {
      expect(gate.routeId).not.toMatch(/^\(no layout route/)
      // Guards the rest of this suite against passing having probed nothing.
      expect(gate.urls.length, gate.routeId).toBeGreaterThan(0)
    }
  })

  it("every gated route is not-found in a build without its audience", async () => {
    build.audiences = new Set(["public"])
    for (const gate of gated) {
      for (const url of gate.urls) {
        const status = await gateStatusAt(url)
        expect(status.get(gate.routeId), url).toBe("notFound")
      }
    }
  })

  it("the same routes load past the gate when the build carries the audience", async () => {
    for (const gate of gated) {
      build.audiences = new Set(["public", gate.audience])
      for (const url of gate.urls) {
        const status = await gateStatusAt(url)
        expect(status.get(gate.routeId), url).toBe("success")
      }
    }
    build.audiences = new Set(["public"])
  })

  it("the link scan recognises a quoted path and nothing looser", () => {
    expect(namesPath(`<Link to="/lan">`, "/lan")).toBe(true)
    expect(namesPath(`navigate({ to: '/lan' })`, "/lan")).toBe(true)
    expect(namesPath("redirect({ to: `/obs/$id` })", "/obs/$id")).toBe(true)
    expect(namesPath(`<Link to="/lang">`, "/lan")).toBe(false)
    expect(namesPath(`"/_dashboard/_lan/lan"`, "/lan")).toBe(false)
    expect(
      IMPORTS_HAS_AUDIENCE.test(
        `import { hasAudience } from "@/lib/build-profile"`
      )
    ).toBe(true)
  })

  it("public source links to a gated page only where it can ask hasAudience", () => {
    const gateDirs = gated.map((g) => g.dir)
    const files = sourceFiles("src").filter(
      (f) =>
        !gateDirs.some((d) => f.startsWith(`${d}/`)) &&
        !f.includes("__tests__") &&
        !f.endsWith("routeTree.gen.ts")
    )
    // Guards against scanning nothing (a wrong root reads as all-clear).
    expect(files).toContain("src/main.tsx")

    const unguarded = files.flatMap((file) => {
      const source = readFileSync(join(APP_ROOT, file), "utf8")
      if (IMPORTS_HAS_AUDIENCE.test(source)) return []
      return gated
        .flatMap((g) => g.paths)
        .filter((path) => namesPath(source, path))
        .map((path) => `${file} links to ${path}`)
    })
    expect(unguarded).toEqual([])
  })

  // The router behaviour the design leans on, isolated from www's routes: a
  // pre-guard hook that throws must not pre-empt the guard's not-found.
  it.each(["validateSearch", "params.parse"])(
    "a throwing %s under a failing guard still ends in not-found",
    async (hook) => {
      const boom = (): never => {
        throw new Error("stub called")
      }
      const root = createRootRoute({ component: Outlet })
      const guard = createRoute({
        getParentRoute: () => root,
        id: "_gate",
        beforeLoad: (): never => {
          throw notFound()
        },
      })
      // One route, with the hook under test throwing and the other a no-op.
      const child = createRoute({
        getParentRoute: () => guard,
        path: "/page/$id",
        validateSearch: (search: Record<string, unknown>) =>
          hook === "validateSearch" ? boom() : search,
        params: {
          parse: (params: { id: string }) =>
            hook === "params.parse" ? boom() : params,
          stringify: (params: { id: string }) => params,
        },
      })
      const router = createRouter({
        routeTree: root.addChildren([guard.addChildren([child])]),
        history: createMemoryHistory({ initialEntries: ["/page/1?x=1"] }),
      })
      await router.load()
      const status = new Map(
        router.state.matches.map((m) => [m.routeId, m.status])
      )
      expect(status.get("/_gate")).toBe("notFound")
    }
  )
})
