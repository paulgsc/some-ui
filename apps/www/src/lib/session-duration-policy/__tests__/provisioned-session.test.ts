import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { SessionActivity } from "@some-ui/activity-catalog"
import { sequenceScenes } from "@some-ui/activity-catalog"
import { describe, expect, it } from "vitest"

import {
  checkSessionDuration,
  DEFAULT_SESSION_DURATION_POLICY,
} from "@/lib/session-duration-policy/index"

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * `paulgsc/server`'s `activity_repo::provisioning::provision`, dumped by hand
 * with `cargo run --bin dump-proposed-session` (paulgsc/server#281).
 * Regenerate it when the seed migration or the recommender's rules change.
 */
const proposedSession: ReadonlyArray<SessionActivity> = JSON.parse(
  readFileSync(
    join(__dirname, "testdata/proposed-session.snapshot.json"),
    "utf-8"
  )
)

/**
 * A server-proposed session passes the client's real `checkSessionDuration`,
 * through the same `sequenceScenes` a Basic-composer session calls.
 */
describe("a server-provisioned session passes the client's own duration policy", () => {
  const scenes = sequenceScenes(proposedSession)

  it("schedules every activity at its floor, never its default", () => {
    // honeycomb: floor 5m (its own minMinutes), default 10m.
    // topik: floor 10m (client's 5m floor loses to its own 10m minMinutes), default 15m.
    expect(scenes.map((scene) => scene.duration)).toEqual([
      5 * 60_000,
      10 * 60_000,
    ])
  })

  it("passes checkSessionDuration outright", () => {
    expect(checkSessionDuration(scenes)).toEqual({ state: "valid" })
  })

  it("stays under maxTotalDurationMs, the way it must at any k", () => {
    const totalMs = scenes.reduce((sum, scene) => sum + scene.duration, 0)
    expect(totalMs).toBeLessThanOrEqual(
      DEFAULT_SESSION_DURATION_POLICY.maxTotalDurationMs
    )
  })
})
