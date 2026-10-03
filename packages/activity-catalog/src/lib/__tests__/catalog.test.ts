import {
  ACTIVITY_CATALOG,
  findActivity,
  isActivityId,
} from "@activity-catalog/lib/catalog"
import { describe, expect, it } from "vitest"

describe("reading an activity id back from storage", () => {
  it("resolves an id the catalogue still offers", () => {
    expect(isActivityId("topik")).toBe(true)
    expect(findActivity("topik")).toBe(ACTIVITY_CATALOG.topik)
  })

  it("returns nothing for a retired id instead of a missing definition", () => {
    // "interview" was offered until it was retired; sessions composed with it
    // are still stored on devices and on the server.
    expect(isActivityId("interview")).toBe(false)
    expect(findActivity("interview")).toBeUndefined()
  })

  it("does not mistake an inherited property for an activity", () => {
    expect(isActivityId("toString")).toBe(false)
    expect(findActivity("constructor")).toBeUndefined()
  })
})
