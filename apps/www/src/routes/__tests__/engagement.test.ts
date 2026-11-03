/**
 * @vitest-environment jsdom
 *
 * Every route in a wing has its affordances placed in the engagement
 * registry (`@some-ui/engagement`, ENG1), or is listed there as offering
 * nothing, with why. Read from the real route tree, as `wings.test.ts` reads
 * it for rooms, so a route added later to a wing fails here until it is
 * placed. The registry's routes are held the other way too: each one is a
 * route, in a room of its pipeline's own wing, on the surface its layout
 * allows.
 */

import { routesByPath } from "@/test-support/route-tree"
import { PIPELINES, UNMEASURED } from "@some-ui/engagement"
import { beforeAll, describe, expect, it } from "vitest"

import { wingOf, WINGS } from "@/lib/wings"

/** Every route's path as a link names it, with its id (which names its layouts). */
let routes: Map<string, string>

beforeAll(async () => {
  routes = await routesByPath()
}, 60_000)

const wingAt = (path: string): string | undefined => wingOf(path)?.id

const offeredOn = new Set(
  PIPELINES.flatMap((p) => p.affordances.flatMap((a) => a.routes))
)
const unmeasured = new Set(UNMEASURED.map((u) => u.route))

describe("engagement: every route in a wing has its affordances placed", () => {
  it("places each route of a wing's rooms, or says why it offers nothing", () => {
    const inWings = [...routes.keys()].filter((path) => {
      const wing = wingAt(path)
      return wing !== undefined && wing !== "public"
    })
    expect(inWings.length).toBeGreaterThan(10)
    for (const path of inWings)
      expect(offeredOn.has(path) || unmeasured.has(path), path).toBe(true)
  })

  it("gives every wing but the public front a pipeline", () => {
    for (const wing of WINGS.filter((w) => w.id !== "public"))
      expect(
        PIPELINES.some((p) => p.wing === wing.id),
        wing.id
      ).toBe(true)
  })

  it("names only real routes, each in its pipeline's own wing", () => {
    for (const route of unmeasured) {
      expect(routes.has(route), route).toBe(true)
      expect(wingAt(route), route).not.toBe("public")
    }
    for (const pipeline of PIPELINES)
      for (const a of pipeline.affordances)
        for (const route of a.routes) {
          const at = `${pipeline.id}/${a.id} on ${route}`
          expect(routes.has(route), at).toBe(true)
          expect(wingAt(route), at).toBe(pipeline.wing)
        }
  })

  it("puts each affordance on a surface its routes are built for", () => {
    for (const pipeline of PIPELINES)
      for (const a of pipeline.affordances)
        for (const route of a.routes) {
          const id = routes.get(route) ?? ""
          const at = `${pipeline.id}/${a.id} (${a.surface}) on ${route}`
          // `_apk` routes are the Android app's alone, `_lan` the home
          // network's web (packages/some-vite-config/AUDIENCES.md).
          if (id.includes("/_apk/")) expect(a.surface, at).toBe("apk")
          if (id.includes("/_lan/")) expect(a.surface, at).toBe("web")
        }
  })
})
