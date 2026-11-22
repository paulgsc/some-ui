/**
 * The public site is a CV (C1055, #3401): its build routes to the résumé and
 * the authorship record alone, from a route tree of its own
 * (build.paths.ts, `PAGES_ROUTE_FILES`), and any other path loads the static
 * landing (`lib/pages-surface`, `keepToPagesSurface`). Read against the real
 * route files, so a route renamed or moved shows here.
 */
import { readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { PAGES_ROUTE_FILES, pagesRouteIgnorePattern } from "@/build.paths"
import { isRedirect } from "@tanstack/react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as PagesSurface from "@/lib/pages-surface"

const ROUTES = resolve(import.meta.dirname, "..")

/**
 * The route files the Pages build's generator keeps: every name, at every
 * depth, that the ignore pattern lets through, as the router generator
 * reads the directory.
 */
function keptRouteFiles(dir: string, ignore: RegExp): Array<string> {
  return readdirSync(dir).flatMap((name) => {
    if (name.match(ignore)) return []
    const path = join(dir, name)
    return statSync(path).isDirectory()
      ? keptRouteFiles(path, ignore)
      : [path.slice(ROUTES.length + 1)]
  })
}

describe("the Pages build's route tree", () => {
  it("keeps the root, the dashboard frame, the résumé and the authorship record, and nothing else", () => {
    const kept = keptRouteFiles(
      ROUTES,
      new RegExp(pagesRouteIgnorePattern(), "g")
    )
    expect(kept.sort()).toEqual([
      "__root.tsx",
      "_dashboard.tsx",
      "_dashboard/resume.tsx",
      "authorship.tsx",
    ])
  })

  it("names only route files that exist", () => {
    const names = new Set(
      [ROUTES, join(ROUTES, "_dashboard")].flatMap((dir) => readdirSync(dir))
    )
    for (const name of PAGES_ROUTE_FILES) expect(names).toContain(name)
  })
})

describe("keepToPagesSurface", () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock("@/lib/build-profile")
  })

  async function surface(pagesSite: boolean): Promise<typeof PagesSurface> {
    vi.doMock("@/lib/build-profile", async (importOriginal) => ({
      ...(await importOriginal<object>()),
      PAGES_SITE: pagesSite,
    }))
    return await import("@/lib/pages-surface")
  }

  it("on the public site, lets the résumé and the authorship record through", async () => {
    const { keepToPagesSurface } = await surface(true)
    for (const path of ["/resume", "/authorship", "/authorship/x"]) {
      expect(() => keepToPagesSurface(path)).not.toThrow()
    }
  })

  it("on the public site, sends any other path to the landing as a whole page", async () => {
    const { keepToPagesSurface } = await surface(true)
    for (const path of [
      "/",
      "/app",
      "/extensions",
      "/sessions/new",
      "/resumes",
    ]) {
      let thrown: unknown
      try {
        keepToPagesSurface(path)
      } catch (error) {
        thrown = error
      }
      expect(isRedirect(thrown)).toBe(true)
      expect(thrown).toMatchObject({
        options: { href: import.meta.env.BASE_URL, reloadDocument: true },
      })
    }
  })

  it("does nothing in any other build", async () => {
    const { keepToPagesSurface } = await surface(false)
    expect(() => keepToPagesSurface("/app")).not.toThrow()
  })
})
