import { describe, expect, it } from "vitest"

import { API_V1_PREFIX, apiUrl, DEFAULT_API_BASE_URL } from "./api-config"

describe("apiUrl", () => {
  it("prefixes the path with the versioned base path against the default base URL", () => {
    expect(apiUrl("/get_attributions/123").toString()).toBe(
      `${DEFAULT_API_BASE_URL}${API_V1_PREFIX}/get_attributions/123`
    )
  })

  it("accepts a custom base URL", () => {
    expect(apiUrl("/mood_events", "http://localhost:3000").toString()).toBe(
      "http://localhost:3000/api/v1/mood_events"
    )
  })

  it("preserves query-string-shaped path segments used as route param placeholders", () => {
    expect(apiUrl("/mood_events/:id").pathname).toBe("/api/v1/mood_events/:id")
  })
})
