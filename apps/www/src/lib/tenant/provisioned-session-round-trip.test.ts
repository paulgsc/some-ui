import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  defaultSessionName,
  sequenceScenes,
  totalDurationOfScenes,
} from "@some-ui/activity-catalog"
import { describe, expect, it } from "vitest"

import {
  checkSessionDuration,
  DEFAULT_SESSION_DURATION_POLICY,
} from "@/lib/session-duration-policy"

import type { SessionRecord } from "./types"

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * `paulgsc/server`'s `nudge::waker::materialize_provisioned_session`
 * (`#282`, RCM5), run once and copied here by hand
 * (`cargo run --bin dump-provisioned-session`, `paulgsc/server#282`) — the
 * same by-hand fixture discipline `session-duration-policy`'s own
 * `provisioned-session.test.ts` already uses for RCM4's narrower fixture,
 * scaled up here from just `activities` to a full `SessionRecord`.
 *
 * Regenerate this file whenever the server's seed migration, the
 * recommender's rules, or the naming/duration logic change in a way that
 * would move which activities get proposed, what they're named, or what
 * they're scheduled at — see the dump binary's own doc comment.
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
 * `JSON.parse` returns `any`, so `const record: SessionRecord =
 * JSON.parse(...)` performs neither compile-time nor runtime checking - a
 * regenerated fixture that dropped or renamed a required field, or shipped
 * a malformed nested `activities` entry, would still "pass" every
 * assertion below that doesn't happen to touch it. This is a minimal
 * structural check, not a full schema (`some-ui#1052`'s own "hand-written
 * schema" acceptance criterion is that, and it doesn't exist yet) - just
 * enough to make the round-trip claim this file's own docstring makes
 * actually enforced rather than assumed.
 */
function assertIsSessionRecord(value: unknown): asserts value is SessionRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error("fixture did not parse to an object")
  }
  // `object` has no index signature, so reading named fields off it needs a
  // cast - this is the trust boundary this function exists to check, the
  // same justification `useLocalStorage`'s own deserializer gives its
  // otherwise-identical `as T`, except every field below is actually
  // verified rather than assumed.
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
 * `paulgsc/server#282`'s own acceptance criterion: "a provisioned session
 * round-trips through `SessionRepository` and deserialises into the
 * client's `SessionRecord` without error — verified by a fixture the
 * client repo consumes, not by a hand-copied type." This is that fixture
 * and that test — every assertion below runs the fixture through the real
 * client functions a device actually calls (`sequenceScenes`,
 * `defaultSessionName`, `totalDurationOfScenes`, `checkSessionDuration`),
 * never a reimplementation of what any of them should produce.
 */
describe("a server-provisioned session round-trips into the client's SessionRecord (server#282)", () => {
  const record: SessionRecord = loadFixture()

  it("deserialises into a well-formed SessionRecord", () => {
    expect(record.id).toMatch(/^session-/)
    expect(record.status).toBe("scheduled")
    expect(record.layoutMode).toBe("basic")
    expect(record.activities.length).toBeGreaterThan(0)
  })

  it("writes scenes as an empty array, RCM5's own decision — not a durationless or partly-fake scene list", () => {
    // #282's own acceptance criterion: the scenes decision's consequences
    // for existing client consumers are enumerated in docs/study-nudge.md.
    // `live-player.tsx`'s `configure(session.scenes)` is the one that
    // actually needs `scenes` populated before Start — this fixture
    // documents the shape that consumer has to handle, it does not
    // populate it, since no client story yet materialises scenes on
    // read (see study-nudge.md's "Materialising a session" section).
    expect(record.scenes).toEqual([])
  })

  it("omits layout entirely — SQL NULL, not the JSON string 'null'", () => {
    // The distinction the migration comment insists on: `deserializeExplicitNull`-
    // equivalent absence, not an explicit null the client would read as
    // "someone cleared it." A key present with value `null` would still
    // satisfy `record.layout === undefined` at the TS level, so the
    // stronger check is against the raw JSON text itself.
    expect(record.layout).toBeUndefined()
    expect(rawFixture).not.toContain('"layout"')
  })

  it("names the session exactly what defaultSessionName would produce for the same activity list", () => {
    const activityIds = record.activities.map((activity) => activity.activityId)
    expect(record.name).toBe(defaultSessionName(activityIds))
  })

  it("schedules every activity at its floor, never its default", () => {
    const scenes = sequenceScenes(record.activities)
    // honeycomb: floor 5m (its own minMinutes), default 10m.
    // topik: floor 10m (topik's own 10m minimum beats the client's 5m
    // floor), default 15m.
    expect(scenes.map((scene) => scene.duration)).toEqual([
      5 * 60_000,
      10 * 60_000,
    ])
  })

  it("passes checkSessionDuration outright, the same guarantee server#281 established for activities alone", () => {
    const scenes = sequenceScenes(record.activities)
    expect(checkSessionDuration(scenes)).toEqual({ state: "valid" })
  })

  it("computes totalDurationMs identically to what materialising scenes would produce", () => {
    // The server's own documented equivalence (activity_repo::provisioning::
    // total_duration_ms's doc comment): for a `basic`-layout session, the
    // sum of provisioned durations equals `totalDurationOfScenes` of the
    // scenes `sequenceScenes` would build, because Basic scenes are placed
    // back-to-back with no gaps or overlap. This is the assertion that
    // proves it rather than just claiming it.
    const scenes = sequenceScenes(record.activities)
    expect(record.totalDurationMs).toBe(totalDurationOfScenes(scenes))
  })

  it("stays under maxTotalDurationMs", () => {
    expect(record.totalDurationMs).toBeLessThanOrEqual(
      DEFAULT_SESSION_DURATION_POLICY.maxTotalDurationMs
    )
  })
})
