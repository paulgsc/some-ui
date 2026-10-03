import { describe, expect, it } from "vitest"

import type { SessionRecord, SessionStatus } from "@/lib/tenant"
import { resumableSession } from "@/lib/tenant"

function session(id: string, status: SessionStatus): SessionRecord {
  return {
    id,
    name: id,
    status,
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 10 * 60_000,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
  }
}

describe("resumableSession", () => {
  it("offers the first started, unfinished session in list order", () => {
    expect(
      resumableSession([
        session("done", "completed"),
        session("planned", "scheduled"),
        session("paused", "paused"),
        session("older", "active"),
      ])?.id
    ).toBe("paused")
  })

  it("offers nothing when only drafts, plans and finished ones remain", () => {
    expect(
      resumableSession([
        session("draft", "draft"),
        session("planned", "scheduled"),
        session("done", "completed"),
      ])
    ).toBeNull()
  })
})
