import {
  isExtensionMessage,
  isGetTabFilterStateResponse,
} from "@filter/lib/content/guard"
import { describe, expect, it } from "vitest"

describe("isExtensionMessage — TOGGLE_FILTER", () => {
  it("accepts a well-formed TOGGLE_FILTER carrying enabled + config", () => {
    expect(
      isExtensionMessage({
        type: "TOGGLE_FILTER",
        enabled: true,
        config: {
          invert: 0,
          hueRotate: 0,
          sepia: 0,
          brightness: 0.7,
          contrast: 0.95,
        },
      })
    ).toBe(true)
  })

  it("accepts enabled: false with a config (unfilter push)", () => {
    expect(
      isExtensionMessage({
        type: "TOGGLE_FILTER",
        enabled: false,
        config: {},
      })
    ).toBe(true)
  })

  // This is the regression: a TOGGLE_FILTER with no payload used to be
  // accepted by the guard (the type had no fields to validate), which is
  // exactly how the background's config/enabled silently got dropped on
  // the way to the content script.
  it("rejects a bare TOGGLE_FILTER with no enabled/config payload", () => {
    expect(isExtensionMessage({ type: "TOGGLE_FILTER" })).toBe(false)
  })

  it("rejects a TOGGLE_FILTER missing enabled", () => {
    expect(isExtensionMessage({ type: "TOGGLE_FILTER", config: {} })).toBe(
      false
    )
  })

  it("rejects a TOGGLE_FILTER with a malformed config", () => {
    expect(
      isExtensionMessage({
        type: "TOGGLE_FILTER",
        enabled: true,
        config: { invert: "yes" },
      })
    ).toBe(false)
  })
})

describe("isGetTabFilterStateResponse", () => {
  it("accepts a well-formed response", () => {
    expect(
      isGetTabFilterStateResponse({
        enabled: true,
        config: {
          invert: 0,
          hueRotate: 0,
          sepia: 0,
          brightness: 0.7,
          contrast: 0.95,
        },
        tabState: "legacy",
      })
    ).toBe(true)
  })

  it("rejects a response missing config", () => {
    expect(isGetTabFilterStateResponse({ enabled: true })).toBe(false)
  })
})
