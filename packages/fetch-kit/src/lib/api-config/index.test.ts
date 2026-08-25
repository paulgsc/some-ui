import { describe, expect, it } from "vitest"

import {
  API_V1_PREFIX,
  apiUrl,
  DEFAULT_API_BASE_URL,
  unversionedApiUrl,
} from "."

describe("apiUrl", () => {
  it("builds a URL for a static route against the default base URL", () => {
    expect(apiUrl("/api/v1/mood_events/stats").toString()).toBe(
      `${DEFAULT_API_BASE_URL}/api/v1/mood_events/stats`
    )
  })

  it("accepts a custom base URL", () => {
    expect(
      apiUrl("/api/v1/mood_events", "http://localhost:3000").toString()
    ).toBe("http://localhost:3000/api/v1/mood_events")
  })

  it("leaves an unsubstituted :id placeholder in the resulting pathname - binding it is createQueryHook's job", () => {
    expect(apiUrl("/api/v1/mood_events/:id", { id: "123" }).pathname).toBe(
      "/api/v1/mood_events/:id"
    )
  })

  it("accepts a custom base URL alongside a parameterized route", () => {
    expect(
      apiUrl("/api/v1/sessions/:id", { id: "123" }, "http://localhost:3000")
        .href
    ).toBe("http://localhost:3000/api/v1/sessions/:id")
  })
})

describe("unversionedApiUrl", () => {
  it("builds a URL for an unversioned route with no /api/v1 prefix", () => {
    expect(unversionedApiUrl("/health").toString()).toBe(
      `${DEFAULT_API_BASE_URL}/health`
    )
  })

  it("accepts a custom base URL", () => {
    expect(unversionedApiUrl("/ws", "http://localhost:3000").toString()).toBe(
      "http://localhost:3000/ws"
    )
  })
})

describe("API_V1_PREFIX", () => {
  it("matches the generated API_BASE_PATH", () => {
    expect(API_V1_PREFIX).toBe("/api/v1")
  })
})
