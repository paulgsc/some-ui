import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { SessionActivity } from "@some-ui/activity-catalog"
import {
  defaultSessionName,
  isActivityId,
  sequenceScenes,
  totalDurationOfScenes,
} from "@some-ui/activity-catalog"
import { describe, expect, it } from "vitest"

import {
  checkSessionDuration,
  DEFAULT_SESSION_DURATION_POLICY,
} from "@/lib/session-duration-policy"
import type { SessionRecord } from "@/lib/tenant/types"

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * `paulgsc/server`'s `nudge::waker::materialize_provisioned_session` (RCM5),
 * dumped by hand with `cargo run --bin dump-provisioned-session`
 * (paulgsc/server#282). Regenerate it when the seed migration, the
 * recommender's rules, or the naming/duration logic change.
 */
const rawFixture = readFileSync(
  join(__dirname, "testdata/provisioned-session.snapshot.json"),
  "utf-8"
)

const SESSION_STATUSES = new Set([
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
])

/**
 * A minimal structural check (not a full schema, #1052): `JSON.parse`
 * returns `any`, so a regenerated fixture missing a field would otherwise
 * pass every assertion that doesn't touch it.
 */
function assertIsSessionRecord(value: unknown): asserts value is SessionRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error("fixture did not parse to an object")
  }
  // The trust boundary this function checks: every field read is verified.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
  const record = value as Record<string, unknown>

  if (typeof record.id !== "string") {
    throw new Error(`fixture.id must be a string, got ${typeof record.id}`)
  }
  if (typeof record.name !== "string") {
    throw new Error(`fixture.name must be a string, got ${typeof record.name}`)
  }
  if (typeof record.createdAt !== "string") {
    throw new Error(
      `fixture.createdAt must be a string, got ${typeof record.createdAt}`
    )
  }
  if (typeof record.updatedAt !== "string") {
    throw new Error(
      `fixture.updatedAt must be a string, got ${typeof record.updatedAt}`
    )
  }
  if (
    typeof record.status !== "string" ||
    !SESSION_STATUSES.has(record.status)
  ) {
    throw new Error(
      `fixture.status "${String(record.status)}" is not a known SessionStatus`
    )
  }
  if (record.layoutMode !== "basic" && record.layoutMode !== "advanced") {
    throw new Error(
      `fixture.layoutMode "${String(record.layoutMode)}" is not "basic" or "advanced"`
    )
  }
  if (typeof record.totalDurationMs !== "number") {
    throw new Error("fixture.totalDurationMs must be a number")
  }
  if (!Array.isArray(record.scenes)) {
    throw new Error("fixture.scenes must be an array")
  }
  if (!Array.isArray(record.activities)) {
    throw new Error("fixture.activities must be an array")
  }
  for (const activity of record.activities) {
    if (typeof activity !== "object" || activity === null) {
      throw new Error("every activities[] entry must be an object")
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above
    const { activityId, config } = activity as Record<string, unknown>
    if (typeof activityId !== "string") {
      throw new Error("activities[].activityId must be a string")
    }
    if (typeof config !== "object" || config === null) {
      throw new Error("activities[].config must be an object")
    }
  }
}

function loadFixture(): SessionRecord {
  const parsed: unknown = JSON.parse(rawFixture)
  assertIsSessionRecord(parsed)
  return parsed
}

/**
 * A provisioned session deserialises into the client's `SessionRecord`,
 * checked through the real client functions (`sequenceScenes`,
 * `defaultSessionName`, `totalDurationOfScenes`, `checkSessionDuration`).
 */
describe("a server-provisioned session round-trips into the client's SessionRecord", () => {
  const record: SessionRecord = loadFixture()
  // The server provisions only activities this client still offers, so every
  // stored id must narrow; one that doesn't fails here, by name.
  const activities: Array<SessionActivity> = record.activities.map(
    ({ activityId, config }) => {
      if (!isActivityId(activityId)) {
        throw new Error(`fixture names a retired activity: ${activityId}`)
      }
      return { activityId, config }
    }
  )

  it("deserialises into a well-formed SessionRecord", () => {
    expect(record.id).toMatch(/^session-/)
    expect(record.status).toBe("scheduled")
    expect(record.layoutMode).toBe("basic")
    expect(record.activities.length).toBeGreaterThan(0)
  })

  it("writes scenes as an empty array, not a durationless or partly-fake scene list", () => {
    // The shape `live-player.tsx`'s `configure(session.scenes)` must handle
    // (docs/study-nudge.md, "Materialising a session").
    expect(record.scenes).toEqual([])
  })

  it("omits layout entirely — SQL NULL, not the JSON string 'null'", () => {
    // Absent, not an explicit null ("someone cleared it"); checked against
    // the raw JSON, since a present `null` key is not distinguishable here.
    expect(record.layout).toBeUndefined()
    expect(rawFixture).not.toContain('"layout"')
  })

  it("names the session exactly what defaultSessionName would produce for the same activity list", () => {
    const activityIds = activities.map((activity) => activity.activityId)
    expect(record.name).toBe(defaultSessionName(activityIds))
  })

  it("schedules every activity at its floor, never its default", () => {
    const scenes = sequenceScenes(activities)
    // honeycomb: floor 5m (its own minMinutes), default 10m.
    // topik: floor 10m (topik's own 10m minimum beats the client's 5m
    // floor), default 15m.
    expect(scenes.map((scene) => scene.duration)).toEqual([
      5 * 60_000,
      10 * 60_000,
    ])
  })

  it("passes checkSessionDuration outright, as a proposed activity list does", () => {
    const scenes = sequenceScenes(activities)
    expect(checkSessionDuration(scenes)).toEqual({ state: "valid" })
  })

  it("computes totalDurationMs identically to what materialising scenes would produce", () => {
    // Basic scenes sit back-to-back, so the sum of provisioned durations
    // equals `totalDurationOfScenes` (activity_repo::provisioning).
    const scenes = sequenceScenes(activities)
    expect(record.totalDurationMs).toBe(totalDurationOfScenes(scenes))
  })

  it("stays under maxTotalDurationMs", () => {
    expect(record.totalDurationMs).toBeLessThanOrEqual(
      DEFAULT_SESSION_DURATION_POLICY.maxTotalDurationMs
    )
  })
})
