import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import type { SessionRecord } from "../tenant/types"
import type { NudgeDecision, NudgePreferences } from "./index"
import { decideNudge } from "./index"

/**
 * Runs the decision table shared with `paulgsc/server`.
 *
 * After #924 there are two implementations of one policy, permanently and
 * by design: `decideNudge` here for the static build, and the Rust port in
 * `file_host` for everything else. Two implementations of one rule set
 * drift. Not maybe - the only question is which changes first and how long
 * before anyone notices, and "nobody noticed" is the normal outcome for a
 * feature whose failure mode is silence.
 *
 * `fixtures/study-nudge-cases.json` is the defence, and it only works if
 * **both** sides run it. A table one implementation runs is that
 * implementation's test suite with extra steps.
 *
 * ## How the fixture is shared: vendored, with a CI check
 *
 * The copy in `./fixtures/` is vendored from `paulgsc/server`, which is the
 * canonical home - the server's `policy_fixtures.rs` `include_str!`s it
 * directly. `scripts/check-shared-fixture.mjs` fetches the upstream copy
 * and fails when the two disagree, so a rule changed on one side and not
 * the other fails a check rather than quietly changing behaviour on one of
 * two deployments.
 *
 * The alternatives were a submodule or a published package - correct, and
 * heavier than one JSON file justifies - and moving the fixture here and
 * having the server vendor it, which is defensible (this repository owns
 * the original policy) but inverts the same problem rather than solving it.
 * Vendoring puts the cost in one script instead of in the build.
 *
 * ## The timezone convention, asserted rather than assumed
 *
 * The server evaluates in a configured IANA zone; this suite evaluates in
 * whatever zone the machine is in. Several shared cases turn on the local
 * hour - 23:00 and 08:00 UTC are the quiet-hours boundary cases - so a run
 * in any other zone would disagree with the fixture for reasons that have
 * nothing to do with the rules. Both are pinned to UTC below, and the
 * pinning is verified rather than trusted: a runner that ignores `TZ`
 * should fail here with an explanation, not produce 28 confusing
 * mismatches.
 */

// Before any Date in this file. Node re-reads TZ on the next date operation.
process.env.TZ = "UTC"

type Case = {
  name: string
  serverOnly?: boolean
  sessions: Array<Partial<SessionRecord> & { id: string }>
  preferences?: Partial<NudgePreferences>
  now?: string
  timezone?: string
  pageVisible?: boolean
  lastNudgeAt?: string | null
  expect: {
    kind: "silent" | "nudge"
    reason?: string
    sessionId?: string
    title?: string
    body?: string
  }
}

type Fixture = {
  defaults: {
    /** Every field of a session but its id, which each case supplies. */
    session: Omit<SessionRecord, "id">
    preferences: NudgePreferences
    now: string
    timezone: string
    pageVisible: boolean
    lastNudgeAt: string | null
  }
  cases: Array<Case>
}

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/study-nudge-cases.json"
)

/**
 * Read rather than imported, so that a missing or unparseable fixture
 * throws here — at module load, taking the whole file down — instead of
 * being bundled as `undefined` and quietly running zero cases. A green run
 * over an empty table is the exact outcome this file exists to prevent.
 */
const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"))

/**
 * The count the Rust harness asserts it will not fall below. Duplicated on
 * purpose: it is a guard against the table being quietly emptied on one
 * side, and a guard that reads its own bound from the file it is guarding
 * guards nothing.
 */
const MINIMUM_SHARED_CASES = 20

const defaults = fixture.defaults
const cases = fixture.cases
const shared = cases.filter((c) => !c.serverOnly)

describe("the shared decision table", () => {
  it("was actually loaded", () => {
    expect(Array.isArray(cases), "fixture has no `cases` array").toBe(true)
    expect(cases.length, "fixture is empty").toBeGreaterThan(0)
  })

  it("evaluates in UTC, as the fixture's cases assume", () => {
    expect(
      new Date().getTimezoneOffset(),
      "this suite must run in UTC - several shared cases turn on the local hour. " +
        "Node ignored process.env.TZ here; run with TZ=UTC."
    ).toBe(0)
  })

  it("still covers the cases the client suite covers", () => {
    // The Rust side asserts the same floor. Either one dropping below it
    // means the table was emptied rather than the rules simplified.
    expect(shared.length).toBeGreaterThanOrEqual(MINIMUM_SHARED_CASES)
  })

  it("skips only the reasons this implementation does not have", () => {
    // `serverOnly` covers snooze, already-nudged-today, and the configured
    // zone - three things that exist in `nudge_log` and in the server's
    // clock and nowhere here. Everything else is shared, and a fixture that
    // marked a shared rule server-only would silently stop guarding it.
    expect(cases.length - shared.length).toBeGreaterThan(0)
    expect(shared.length).toBeGreaterThan(cases.length - shared.length)
  })
})

/**
 * The same shallow merge the Rust harness does, so the two read the file
 * identically. Shallow by design: every override in the file replaces a
 * whole field, and a deep merge would only invite fixtures that are hard to
 * read.
 */
function sessionFrom(
  overrides: Partial<SessionRecord> & { id: string }
): SessionRecord {
  return { ...defaults.session, ...overrides }
}

describe.each(shared.map((c) => [c.name, c] as const))(
  "%s",
  (_name, testCase) => {
    it("agrees with the fixture", () => {
      const decision: NudgeDecision = decideNudge({
        sessions: testCase.sessions.map(sessionFrom),
        now: new Date(testCase.now ?? defaults.now),
        pageVisible: testCase.pageVisible ?? defaults.pageVisible,
        lastNudgeAt:
          testCase.lastNudgeAt === undefined
            ? defaults.lastNudgeAt
            : testCase.lastNudgeAt,
        preferences: { ...defaults.preferences, ...testCase.preferences },
      })

      const want = testCase.expect

      if (want.kind === "silent") {
        expect(decision).toEqual({ kind: "silent", reason: want.reason })
        return
      }

      expect(decision.kind).toBe("nudge")
      if (decision.kind !== "nudge") return

      expect(decision.sessionId).toBe(want.sessionId)
      // Title and body are asserted only where the case states them, so a
      // case about ranking does not also have to restate the copy.
      if (want.title !== undefined) expect(decision.title).toBe(want.title)
      if (want.body !== undefined) expect(decision.body).toBe(want.body)
    })
  }
)
