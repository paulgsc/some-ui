/**
 * @vitest-environment jsdom
 *
 * Every route belongs to exactly one room, to the foyer or to the front desk
 * (lib/wings). Read from the real route tree, so a route added later fails
 * here until it is placed, and a route placed twice fails too.
 */

import { routesByPath } from "@/test-support/route-tree"
import { beforeAll, describe, expect, it } from "vitest"

import { FOYER, FRONT_DESK, owns, ROOMS } from "@/lib/wings"

/** Every route's path as a link names it, layouts and gates left out. */
let paths: Array<string>

beforeAll(async () => {
  paths = [...(await routesByPath()).keys()]
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
})
