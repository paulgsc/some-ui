/**
 * @vitest-environment jsdom
 *
 * Every route belongs to exactly one room, to the foyer or to the front desk
 * (lib/wings). Read from the real route tree, so a route added later fails
 * here until it is placed, and a route placed twice fails too.
 */

import { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import { beforeAll, describe, expect, it } from "vitest"

import { FOYER, FRONT_DESK, owns, ROOMS } from "@/lib/wings"

/** Every route's path as a link names it, layouts and gates left out. */
let paths: Array<string>

beforeAll(async () => {
  const { routeTree } = await import("@/routeTree.gen")
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
  })
  paths = Object.keys(router.routesByPath).map((path) =>
    path.length > 1 ? path.replace(/\/$/, "") : path
  )
}, 60_000)

describe("wings: every route has one owner", () => {
  it("places each route in exactly one room, the foyer or the front desk", () => {
    expect(paths.length).toBeGreaterThan(10)
    for (const path of paths) {
      const owners = [
        ...ROOMS.filter((room) => room.roots.some((root) => owns(root, path))),
        ...(owns(FOYER, path) ? ["foyer"] : []),
        ...FRONT_DESK.filter((root) => owns(root, path)),
      ]
      expect(owners, path).toHaveLength(1)
    }
  })

  it("names only routes that exist", () => {
    const known = new Set(paths)
    for (const root of [
      ...ROOMS.flatMap((room) => room.roots),
      FOYER,
      ...FRONT_DESK,
    ])
      expect(known.has(root), root).toBe(true)
  })
})
