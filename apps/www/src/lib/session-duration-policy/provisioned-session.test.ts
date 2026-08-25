import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { SessionActivity } from "@some-ui/activity-catalog"
import { sequenceScenes } from "@some-ui/activity-catalog"
import { describe, expect, it } from "vitest"

import { checkSessionDuration, DEFAULT_SESSION_DURATION_POLICY } from "./index"

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * `paulgsc/server`'s `activity_repo::provisioning::provision`, run once
 * against the real recommender and copied here by hand
 * (`cargo run --bin dump-proposed-session`, `paulgsc/server#281`) — the
 * same by-hand fixture discipline `to-scene-config`'s own
 * `session-activity-round-trip.test.ts` already uses for #272's round trip.
 *
 * Regenerate this file whenever the server's seed migration or the
 * recommender's rules change in a way that would move which activities get
 * proposed or what they're scheduled at — see the dump binary's own doc
 * comment.
 */
const proposedSession: ReadonlyArray<SessionActivity> = JSON.parse(
  readFileSync(
    join(__dirname, "testdata/proposed-session.snapshot.json"),
    "utf-8"
  )
)

/**
 * `paulgsc/server#281` (RCM4)'s own acceptance criterion: "a proposed
 * session passes the client's `checkSessionDuration` — verified by a
 * fixture consumed on the client side, not by re-implementing the check
 * here." This is that fixture and that test.
 *
 * The pipeline below is exactly what a real device runs — `sequenceScenes`
 * is the same function a Basic-composer session already calls (#272's own
 * argument for why a server-composed session is not a new client code
 * path) — so this cannot pass by agreeing with a reimplementation of
 * `checkSessionDuration`'s logic; it can only pass by actually satisfying
 * the real one.
 */
describe("a server-provisioned session passes the client's own duration policy (server#281)", () => {
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
