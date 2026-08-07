import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  acceptedStatuses,
  bindPath,
  defineContract,
  fullPath,
  requestUrl,
  schemaStatuses,
} from "./contract"

describe("fullPath", () => {
  it("prefixes versioned routes", () => {
    expect(fullPath({ path: "/mood_events" })).toBe("/api/v1/mood_events")
  })

  it("leaves the unversioned exceptions alone", () => {
    expect(fullPath({ path: "/health", versioned: false })).toBe("/health")
  })
})

describe("bindPath", () => {
  it("substitutes placeholders", () => {
    const bound = bindPath("/api/v1/mood_events/:id", { id: 42 })
    expect(bound.path).toBe("/api/v1/mood_events/42")
    expect(bound.unbound).toEqual([])
    expect(bound.unused).toEqual([])
  })

  it("handles several placeholders in one template", () => {
    const bound = bindPath("/api/v1/gdrive/write/:folder_id/:name", {
      folder_id: "abc",
      name: "seed.json",
    })
    expect(bound.path).toBe("/api/v1/gdrive/write/abc/seed.json")
  })

  it("reports a placeholder nobody bound, rather than requesting it literally", () => {
    // This is the failure mode the client's own layering invites: apiUrl()
    // returns a URL still carrying ':id', and substitution happens elsewhere.
    const bound = bindPath("/api/v1/mood_events/:id", {})
    expect(bound.unbound).toEqual(["id"])
    expect(bound.path).toBe("/api/v1/mood_events/:id")
  })

  it("reports a binding that matches no placeholder", () => {
    const bound = bindPath("/api/v1/mood_events", { id: 1 })
    expect(bound.unused).toEqual(["id"])
  })

  it("encodes values so a slash cannot forge a path segment", () => {
    const bound = bindPath("/api/v1/tabs/:tab_id", { tab_id: "a/b" })
    expect(bound.path).toBe("/api/v1/tabs/a%2Fb")
  })
})

describe("requestUrl", () => {
  it("appends query parameters", () => {
    const url = requestUrl("http://localhost:3000", "/api/v1/search_audio", {
      q: "bass",
      limit: 5,
    })
    expect(url.toString()).toBe(
      "http://localhost:3000/api/v1/search_audio?q=bass&limit=5"
    )
  })
})

describe("status helpers", () => {
  const contract = defineContract({
    id: "x.y",
    module: "m",
    method: "GET",
    path: "/p",
    summary: "s",
    expect: { status: [200, 404], schemaFor: 200, schema: z.object({}) },
  })

  it("accepts every declared status", () => {
    expect(acceptedStatuses(contract)).toEqual([200, 404])
  })

  it("applies the schema only to the statuses it describes", () => {
    expect(schemaStatuses(contract)).toEqual([200])
  })

  it("defaults schema statuses to all accepted statuses", () => {
    const simple = defineContract({
      id: "x.z",
      module: "m",
      method: "GET",
      path: "/p",
      summary: "s",
      expect: { status: 200, schema: z.object({}) },
    })
    expect(schemaStatuses(simple)).toEqual([200])
  })
})
