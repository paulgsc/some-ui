import { describe, expect, it } from "vitest"

import type { Contract } from "./contract"
import { defineContract } from "./contract"
import type { RouteInventory } from "./drift"
import {
  checkDrift,
  InventoryShapeError,
  InventoryVersionError,
  parseInventory,
} from "./drift"

const inventory = (
  overrides: Partial<RouteInventory> = {}
): RouteInventory => ({
  schema_version: 1,
  api_base_path: "/api/v1",
  server_version: "0.0.0",
  routes: [
    {
      method: "GET",
      path: "/mood_events",
      full_path: "/api/v1/mood_events",
      versioned: true,
      module: "mood_events",
    },
    {
      method: "GET",
      path: "/health",
      full_path: "/health",
      versioned: false,
      module: "health",
    },
  ],
  ...overrides,
})

const listMoodEvents: Contract = defineContract({
  id: "mood_events.list",
  module: "mood_events",
  method: "GET",
  path: "/mood_events",
  summary: "all mood events",
  expect: { status: 200 },
})

describe("checkDrift", () => {
  it("passes when every contract targets a real route", () => {
    const report = checkDrift([listMoodEvents], inventory())
    expect(report.findings.filter((f) => f.severity === "fail")).toEqual([])
    expect(report.covered).toBe(1)
    expect(report.total).toBe(2)
  })

  it("fails when the server no longer serves the path a contract targets", () => {
    const renamed = inventory({
      routes: [
        {
          method: "GET",
          path: "/moods",
          full_path: "/api/v1/moods",
          versioned: true,
          module: "mood_events",
        },
      ],
    })

    const report = checkDrift([listMoodEvents], renamed)
    const failures = report.findings.filter((f) => f.code === "missing-route")

    expect(failures).toHaveLength(1)
    expect(failures[0]?.message).toContain("GET /api/v1/mood_events")
  })

  it("fails when the method moved but the path did not", () => {
    const asPost = inventory({
      routes: [
        {
          method: "POST",
          path: "/mood_events",
          full_path: "/api/v1/mood_events",
          versioned: true,
          module: "mood_events",
        },
      ],
    })

    const report = checkDrift([listMoodEvents], asPost)
    expect(report.findings.some((f) => f.code === "missing-route")).toBe(true)
  })

  it("names an API version bump once instead of failing every contract separately", () => {
    const bumped = inventory({ api_base_path: "/api/v2" })
    const report = checkDrift([listMoodEvents], bumped)

    expect(report.findings.some((f) => f.code === "base-path-mismatch")).toBe(
      true
    )
  })

  it("warns when a contract is filed under a different module than the server uses", () => {
    const misfiled = defineContract({ ...listMoodEvents, module: "hopium" })
    const report = checkDrift([misfiled], inventory())

    expect(report.findings.some((f) => f.code === "module-mismatch")).toBe(true)
  })

  it("reports routes no contract covers, as information rather than failure", () => {
    const report = checkDrift([listMoodEvents], inventory())
    const uncovered = report.findings.filter(
      (f) => f.code === "uncovered-route"
    )

    expect(uncovered).toHaveLength(1)
    expect(uncovered[0]?.severity).toBe("info")
    expect(uncovered[0]?.message).toContain("/health")
  })

  it("refuses a snapshot shape it does not understand", () => {
    expect(() => checkDrift([], inventory({ schema_version: 99 }))).toThrow(
      InventoryVersionError
    )
  })
})

describe("parseInventory", () => {
  it("accepts a well-formed snapshot", () => {
    const parsed = parseInventory(JSON.parse(JSON.stringify(inventory())))
    expect(parsed.routes).toHaveLength(2)
  })

  it("rejects a truncated snapshot rather than reading it as empty", () => {
    // The realistic failure: a half-copied file between two repos. Reading this
    // optimistically would report "no drift" for the worst possible reason.
    expect(() => parseInventory({ schema_version: 1 })).toThrow(
      InventoryShapeError
    )
  })

  it("rejects a route entry missing its method", () => {
    expect(() =>
      parseInventory({
        schema_version: 1,
        api_base_path: "/api/v1",
        server_version: "0.0.0",
        routes: [
          { path: "/x", full_path: "/x", versioned: false, module: "m" },
        ],
      })
    ).toThrow(InventoryShapeError)
  })

  it("still enforces the version after the shape checks out", () => {
    expect(() =>
      parseInventory(
        JSON.parse(JSON.stringify(inventory({ schema_version: 7 })))
      )
    ).toThrow(InventoryVersionError)
  })
})
