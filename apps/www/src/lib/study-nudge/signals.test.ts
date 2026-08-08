/**
 * The signal ingress, which is where the server half's work originates.
 *
 * The property worth pinning hardest is the negative one: only a *change*
 * of status is a behaviour. Reporting `session-started` every time an
 * already-running session is touched would inflate the engagement level the
 * server paces reminders against, and the symptom would be reminders that
 * quietly stop arriving — indistinguishable from the feature working.
 */
import { describe, expect, it } from "vitest"

import type { FileHostTransport } from "../file-host-config/client"
import type { SessionRecord } from "../tenant/types"
import { reportSignal, signalForTransition } from "./signals"

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-1",
    name: "Korean review",
    status: "scheduled",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 20 * 60_000,
    createdAt: "2026-03-14T09:00:00.000Z",
    updatedAt: "2026-03-14T09:00:00.000Z",
    ...overrides,
  }
}

describe("signalForTransition", () => {
  it("reports a create as the opportunity, not a behaviour", () => {
    // Zero delta server-side; it exists so a reminder has something to
    // point at. Without one the selector declines rather than inventing a
    // reminder that opens nothing.
    expect(signalForTransition(session())).toEqual({
      kind: "session-provisioned",
      session_id: "session-1",
    })
  })

  it("reports sitting down", () => {
    expect(
      signalForTransition(session({ status: "active" }), session())
    ).toEqual({ kind: "session-started", session_id: "session-1" })
  })

  it("says nothing when the status did not change", () => {
    // The case this function exists for: renaming a running session is an
    // edit, not a person sitting down again.
    expect(
      signalForTransition(
        session({ status: "active", name: "Renamed" }),
        session({ status: "active" })
      )
    ).toBeNull()
  })

  it("says nothing for draft and scheduled, which are edits", () => {
    expect(
      signalForTransition(
        session({ status: "scheduled" }),
        session({ status: "draft" })
      )
    ).toBeNull()
  })

  it("scores a completion by how much of it they got through", () => {
    const signal = signalForTransition(
      session({ status: "completed", finalElapsedMs: 15 * 60_000 }),
      session({ status: "active" })
    )
    expect(signal).toEqual({
      kind: "session-completed",
      session_id: "session-1",
      score: 0.75,
    })
  })

  it("reads a session with no duration as complete rather than as a failure", () => {
    // Dividing by nothing is not evidence that it went badly, and the
    // server restores momentum in proportion to this number.
    const signal = signalForTransition(
      session({ status: "completed", totalDurationMs: 0 }),
      session({ status: "active" })
    )
    expect(signal).toMatchObject({ kind: "session-completed", score: 1 })
  })

  it("clamps a score that ran over its own estimate", () => {
    const signal = signalForTransition(
      session({ status: "completed", finalElapsedMs: 90 * 60_000 }),
      session({ status: "active" })
    )
    expect(signal).toMatchObject({ score: 1 })
  })

  it("carries elapsed time with an abandonment, because late is worse than early", () => {
    expect(
      signalForTransition(
        session({ status: "paused", finalElapsedMs: 8 * 60_000 }),
        session({ status: "active" })
      )
    ).toEqual({
      kind: "session-abandoned",
      session_id: "session-1",
      elapsed_ms: 8 * 60_000,
    })
  })
})

describe("reportSignal", () => {
  function transport(): FileHostTransport & { calls: Array<string> } {
    const calls: Array<string> = []
    const fn = (route: string, init?: RequestInit): Promise<Response> => {
      calls.push(`${init?.method ?? "GET"} ${route}`)
      return Promise.resolve(
        new Response(
          JSON.stringify({
            kind: "session-started",
            eligible_at: "2026-03-20T00:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    }
    return Object.assign(fn, { calls })
  }

  it("posts to /signals in server mode", async () => {
    const t = transport()

    const sent = await reportSignal(
      { kind: "session-started", session_id: "s1" },
      { transport: t, mode: "server" }
    )

    expect(sent).toBe(true)
    expect(t.calls).toEqual(["POST /signals"])
  })

  it("sends nothing on the static build, which has no engagement ledger", async () => {
    const t = transport()

    expect(
      await reportSignal(
        { kind: "session-started", session_id: "s1" },
        { transport: t, mode: "static" }
      )
    ).toBe(false)
    expect(t.calls).toEqual([])
  })

  it("swallows an unreachable backend rather than failing the mutation that triggered it", async () => {
    // A signal that does not arrive costs accuracy in when a nudge lands.
    // A signal that throws costs someone the ability to start studying
    // because a LAN box is down.
    const dead: FileHostTransport = () =>
      Promise.reject(new Error("Failed to fetch"))

    await expect(
      reportSignal(
        { kind: "session-started", session_id: "s1" },
        { transport: dead, mode: "server" }
      )
    ).resolves.toBe(false)
  })
})
