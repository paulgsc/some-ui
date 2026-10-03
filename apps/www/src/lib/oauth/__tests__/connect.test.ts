import { describe, expect, it } from "vitest"

import type { ConnectEvent, ConnectState, Stepped } from "@/lib/oauth/connect"
import {
  initialState,
  readAuthorizationParams,
  step,
} from "@/lib/oauth/connect"
import type { PendingApproval } from "@/lib/oauth/types"

const APPROVAL: PendingApproval = {
  request: "req-1",
  clientName: "Claude",
  redirectHost: "claude.ai",
  scopes: ["lessons:read"],
}

const PARAMS = { client_id: "client-1", state: "s" }

const arrived: ConnectEvent = {
  type: "arrived",
  params: PARAMS,
  framed: false,
  hasServer: true,
}

/** Steps through `events` from the start, returning the last step. */
function run(...events: Array<ConnectEvent>): Stepped {
  let stepped: Stepped = { state: initialState, effects: [] }
  for (const event of events) stepped = step(stepped.state, event)
  return stepped
}

const asking = (
  session: "signed-in" | "signed-out" | "unknown"
): ConnectState =>
  ({ kind: "asking", approval: APPROVAL, session, notice: null }) as const

describe("step", () => {
  it("hands the request in and asks about the session on arrival, once", () => {
    const first = run(arrived)
    expect(first.state).toEqual({
      kind: "opening",
      params: PARAMS,
      session: "unknown",
    })
    expect(first.effects).toEqual([
      { type: "open", params: PARAMS },
      { type: "learn-session" },
    ])
    // A remount arrives again; nothing is sent twice.
    expect(step(first.state, arrived)).toEqual({
      state: first.state,
      effects: [],
    })
  })

  it("sends nothing from a frame, without a server, or without a request", () => {
    expect(run({ ...arrived, framed: true })).toEqual({
      state: { kind: "unusable", params: PARAMS, reason: "framed" },
      effects: [],
    })
    expect(run({ ...arrived, hasServer: false }).state).toMatchObject({
      reason: "no-server",
    })
    expect(run({ ...arrived, params: {} })).toEqual({
      state: { kind: "unusable", params: {}, reason: "no-request" },
      effects: [],
    })
  })

  it("asks, knowing the session whichever answer came first", () => {
    expect(
      run(
        arrived,
        { type: "session-learned", signedIn: true },
        {
          type: "opened",
          approval: APPROVAL,
        }
      ).state
    ).toEqual(asking("signed-in"))
    expect(
      run(
        arrived,
        { type: "opened", approval: APPROVAL },
        { type: "session-learned", signedIn: false }
      ).state
    ).toEqual(asking("signed-out"))
  })

  it("sends a refusal back to the service only when the server gives a way back", () => {
    const back = run(arrived, {
      type: "refused",
      refusal: {
        error: "invalid_scope",
        description: null,
        redirectTo: "https://x/cb",
      },
    })
    expect(back).toEqual({
      state: { kind: "leaving", host: null, answer: "refused" },
      effects: [{ type: "go", to: "https://x/cb" }],
    })

    const refusal = {
      error: "invalid_client",
      description: "this client is not registered",
      redirectTo: null,
    }
    expect(run(arrived, { type: "refused", refusal })).toEqual({
      state: { kind: "unusable", params: PARAMS, reason: "refused", refusal },
      effects: [],
    })
  })

  it("retries only an unreachable server, with the same request", () => {
    const unreachable = run(arrived, {
      type: "open-failed",
      reason: "unreachable",
    })
    expect(step(unreachable.state, { type: "retry" })).toEqual(run(arrived))
    const off = run(arrived, { type: "open-failed", reason: "not-configured" })
    expect(step(off.state, { type: "retry" }).effects).toEqual([])
  })

  it("approves at once when signed in", () => {
    expect(step(asking("signed-in"), { type: "approve" })).toEqual({
      state: { kind: "answering", approval: APPROVAL, answer: "approve" },
      effects: [{ type: "answer", request: "req-1", answer: "approve" }],
    })
  })

  it("asks for the passkey first when signed out or not yet known, then approves", () => {
    for (const session of ["signed-out", "unknown"] as const) {
      expect(step(asking(session), { type: "approve" })).toEqual({
        state: { kind: "signing-in", approval: APPROVAL },
        effects: [{ type: "sign-in" }],
      })
    }
    const signingIn: ConnectState = { kind: "signing-in", approval: APPROVAL }
    expect(step(signingIn, { type: "signed-in" }).effects).toEqual([
      { type: "answer", request: "req-1", answer: "approve" },
    ])
    expect(
      step(signingIn, {
        type: "sign-in-failed",
        notice: "No passkey was used.",
      }).state
    ).toEqual({ ...asking("signed-out"), notice: "No passkey was used." })
  })

  it("declines without a session", () => {
    expect(step(asking("signed-out"), { type: "deny" }).effects).toEqual([
      { type: "answer", request: "req-1", answer: "deny" },
    ])
  })

  it("ignores a press while busy and a late session probe after the person acted", () => {
    const answering: ConnectState = {
      kind: "answering",
      approval: APPROVAL,
      answer: "approve",
    }
    for (const event of [
      { type: "approve" },
      { type: "deny" },
      { type: "session-learned", signedIn: false },
    ] as const) {
      expect(step(answering, event)).toEqual({ state: answering, effects: [] })
    }
    const known = asking("signed-in")
    expect(
      step(known, { type: "session-learned", signedIn: false }).state
    ).toBe(known)
  })

  it("leaves for the redirect the answer names", () => {
    const answering: ConnectState = {
      kind: "answering",
      approval: APPROVAL,
      answer: "deny",
    }
    expect(
      step(answering, {
        type: "answered",
        redirectTo: "https://x/cb?error=access_denied",
      })
    ).toEqual({
      state: { kind: "leaving", host: "claude.ai", answer: "deny" },
      effects: [{ type: "go", to: "https://x/cb?error=access_denied" }],
    })
  })

  it("ends on an expired request and asks again on any other failure", () => {
    const answering: ConnectState = {
      kind: "answering",
      approval: APPROVAL,
      answer: "approve",
    }
    expect(
      step(answering, { type: "answer-failed", reason: "expired", notice: "x" })
        .state
    ).toEqual({ kind: "unusable", params: {}, reason: "expired" })
    expect(
      step(answering, {
        type: "answer-failed",
        reason: "signed-out",
        notice: "Session ended.",
      }).state
    ).toEqual({ ...asking("signed-out"), notice: "Session ended." })
    expect(
      step(answering, {
        type: "answer-failed",
        reason: "failed",
        notice: "Busy.",
      }).state
    ).toEqual({ ...asking("signed-in"), notice: "Busy." })
  })
})

describe("readAuthorizationParams", () => {
  it("keeps each known parameter exactly as written, and nothing else", () => {
    expect(
      readAuthorizationParams(
        "?client_id=abc&state=1e5&scope=lessons%3Aread+shelf&prompt=consent&state=second"
      )
    ).toEqual({ client_id: "abc", state: "1e5", scope: "lessons:read shelf" })
  })
})
