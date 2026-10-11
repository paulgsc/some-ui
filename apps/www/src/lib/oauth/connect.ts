/**
 * The approval page (`/connect`) as one state union and a pure `step`.
 *
 * An AI service sends the person's browser here with an OAuth authorization
 * request in the query. The page hands the request to the server, which
 * checks it against the registered client and describes it back; the person
 * sees who is asking, where the answer goes and what it allows, and allows
 * (signing in with their passkey first if they need to) or declines. Either
 * answer, and any refusal the server can send back to the service, ends with
 * the browser leaving for the service's redirect.
 *
 * Every arm is something the page shows. `connect-runtime.ts` runs the
 * effects; nothing here touches the network, the passkey or the location.
 */
import type { AuthorizationParams, PendingApproval, Refusal } from "./types"
import { AUTHORIZATION_PARAMS } from "./types"

/** What this page knows of the person's session: the server is asked once, on arrival. */
type SessionKnown = "signed-in" | "signed-out" | "unknown"

/** Why the page cannot ask anything. None of these sends the browser back. */
export type Unusable =
  /** Opened inside another page's frame, where a click could be borrowed. */
  | { reason: "framed" }
  /** The GitHub Pages build: no server, so nothing to connect to. */
  | { reason: "no-server" }
  /** Opened without a request (no `client_id`): not from an AI service. */
  | { reason: "no-request" }
  /** The server refused it and cannot trust the return address. */
  | { reason: "refused"; refusal: Refusal }
  /** The server does not accept AI services (OAuth is off). */
  | { reason: "not-configured" }
  /** The server could not be reached; the only arm worth retrying. */
  | { reason: "unreachable" }
  /** The request expired (ten minutes) or was already answered. */
  | { reason: "expired" }

export type ConnectState =
  | { kind: "idle" }
  | { kind: "opening"; params: AuthorizationParams; session: SessionKnown }
  | {
      kind: "asking"
      approval: PendingApproval
      session: SessionKnown
      /** Why the last attempt did not go through, in words for the person. */
      notice: string | null
    }
  | { kind: "signing-in"; approval: PendingApproval }
  | {
      kind: "answering"
      approval: PendingApproval
      answer: "approve" | "deny"
    }
  | {
      kind: "leaving"
      /** The host the browser is going back to, when the page showed one. */
      host: string | null
      answer: "approve" | "deny" | "refused"
    }
  | ({ kind: "unusable"; params: AuthorizationParams } & Unusable)

/** What the person does. */
export type ConnectIntent =
  | { type: "approve" }
  | { type: "deny" }
  | { type: "retry" }

export type ConnectEvent =
  | ConnectIntent
  | {
      type: "arrived"
      params: AuthorizationParams
      framed: boolean
      hasServer: boolean
    }
  | { type: "opened"; approval: PendingApproval }
  | { type: "refused"; refusal: Refusal }
  | { type: "open-failed"; reason: "not-configured" | "unreachable" }
  | { type: "session-learned"; signedIn: boolean }
  | { type: "signed-in" }
  | { type: "sign-in-failed"; notice: string }
  | { type: "answered"; redirectTo: string }
  | {
      type: "answer-failed"
      reason: "expired" | "signed-out" | "failed"
      notice: string
    }

export type ConnectEffect =
  | { type: "open"; params: AuthorizationParams }
  | { type: "learn-session" }
  | { type: "sign-in" }
  | { type: "answer"; request: string; answer: "approve" | "deny" }
  | { type: "go"; to: string }

export type Stepped = {
  state: ConnectState
  effects: ReadonlyArray<ConnectEffect>
}

export const initialState: ConnectState = { kind: "idle" }

const stay = (state: ConnectState): Stepped => ({ state, effects: [] })

const answering = (
  approval: PendingApproval,
  answer: "approve" | "deny"
): Stepped => ({
  state: { kind: "answering", approval, answer },
  effects: [{ type: "answer", request: approval.request, answer }],
})

const opening = (params: AuthorizationParams): Stepped => ({
  state: { kind: "opening", params, session: "unknown" },
  effects: [{ type: "open", params }, { type: "learn-session" }],
})

export function step(state: ConnectState, event: ConnectEvent): Stepped {
  switch (event.type) {
    case "arrived": {
      // Once per page: a remount (React's strict mode) must not hand the
      // server the same request twice.
      if (state.kind !== "idle") return stay(state)
      const { params } = event
      if (event.framed) {
        return stay({ kind: "unusable", params, reason: "framed" })
      }
      if (!event.hasServer) {
        return stay({ kind: "unusable", params, reason: "no-server" })
      }
      if (params.client_id === undefined || params.client_id === "") {
        return stay({ kind: "unusable", params, reason: "no-request" })
      }
      return opening(params)
    }
    case "retry": {
      return state.kind === "unusable" && state.reason === "unreachable"
        ? opening(state.params)
        : stay(state)
    }
    case "opened": {
      return state.kind === "opening"
        ? stay({
            kind: "asking",
            approval: event.approval,
            session: state.session,
            notice: null,
          })
        : stay(state)
    }
    case "refused": {
      if (state.kind !== "opening") return stay(state)
      const { refusal } = event
      return refusal.redirectTo === null
        ? stay({
            kind: "unusable",
            params: state.params,
            reason: "refused",
            refusal,
          })
        : {
            state: { kind: "leaving", host: null, answer: "refused" },
            effects: [{ type: "go", to: refusal.redirectTo }],
          }
    }
    case "open-failed": {
      return state.kind === "opening"
        ? stay({ kind: "unusable", params: state.params, reason: event.reason })
        : stay(state)
    }
    case "session-learned": {
      const session = event.signedIn ? "signed-in" : "signed-out"
      // Only before the person acts: after that, the sign-in or the answer
      // knows better than a probe sent on arrival.
      if (state.kind === "opening") return stay({ ...state, session })
      if (state.kind === "asking" && state.session === "unknown") {
        return stay({ ...state, session })
      }
      return stay(state)
    }
    case "approve": {
      if (state.kind !== "asking") return stay(state)
      // "Unknown" asks for the passkey too: approving needs a session, and
      // the server, not this page, is what knows whether one is still good.
      return state.session === "signed-in"
        ? answering(state.approval, "approve")
        : {
            state: { kind: "signing-in", approval: state.approval },
            effects: [{ type: "sign-in" }],
          }
    }
    case "deny": {
      // Declining needs no session, so it never asks for the passkey.
      return state.kind === "asking"
        ? answering(state.approval, "deny")
        : stay(state)
    }
    case "signed-in": {
      return state.kind === "signing-in"
        ? answering(state.approval, "approve")
        : stay(state)
    }
    case "sign-in-failed": {
      return state.kind === "signing-in"
        ? stay({
            kind: "asking",
            approval: state.approval,
            session: "signed-out",
            notice: event.notice,
          })
        : stay(state)
    }
    case "answered": {
      return state.kind === "answering"
        ? {
            state: {
              kind: "leaving",
              host: state.approval.redirectHost,
              answer: state.answer,
            },
            effects: [{ type: "go", to: event.redirectTo }],
          }
        : stay(state)
    }
    case "answer-failed": {
      if (state.kind !== "answering") return stay(state)
      if (event.reason === "expired") {
        return stay({ kind: "unusable", params: {}, reason: "expired" })
      }
      return stay({
        kind: "asking",
        approval: state.approval,
        // A 401 ended the session; allowing again asks for the passkey.
        session: event.reason === "signed-out" ? "signed-out" : "signed-in",
        notice: event.notice,
      })
    }
    default: {
      return assertNever(event)
    }
  }
}

/**
 * The request's parameters from the page's raw query string, as the AI
 * service wrote them. Read from `location.search` rather than the router's
 * parsed search, which reads each value as JSON first: a `state` of `1e5`
 * would come back `100000`, and the service would reject its own answer.
 * A repeated parameter is taken once (the first), as the server reads JSON.
 */
export function readAuthorizationParams(search: string): AuthorizationParams {
  const query = new URLSearchParams(search)
  const params: AuthorizationParams = {}
  for (const name of AUTHORIZATION_PARAMS) {
    const value = query.get(name)
    if (value !== null) params[name] = value
  }
  return params
}

function assertNever(value: never): never {
  throw new Error(`unhandled connect event: ${JSON.stringify(value)}`)
}
