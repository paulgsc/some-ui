import type { ReactNode } from "react"

/**
 * What the client currently knows about the viewer's session.
 *
 * `"unknown"` is a first-class state, not a loading flag bolted on the side:
 * on first paint the client has not heard back from the session endpoint yet,
 * and rendering the signed-out surface during that window is the flicker every
 * gated app ships by accident. `AuthGate` renders its `pending` slot for it.
 */
export type AuthStatus = "unknown" | "authenticated" | "unauthenticated"

/**
 * The subset of a server session this package is willing to look at.
 *
 * Deliberately thin. The session itself — the credential that actually gates
 * the backend — is never modelled here, because the client should not be able
 * to hold it: it belongs in a `HttpOnly; Secure; SameSite` cookie the browser
 * attaches on its own and JavaScript cannot read. Nothing in this package
 * reads, writes, or persists a token, so there is no place for one to leak.
 */
export type AuthSession = {
  userId: string
  email: string
  displayName?: string
  /** Absolute expiry as epoch ms, as reported by the server. Display only. */
  expiresAt?: number
}

/**
 * The steps an authentication workflow can be parked on.
 *
 * Modelled as a flat union rather than nested state because the eventual
 * consumer wants these in the URL (`/sign-in`, `/reset-password?token=…`), and
 * a URL segment is flat.
 */
export type AuthFlowStep =
  | "sign-in"
  | "sign-up"
  | "verify-code"
  | "request-reset"
  | "reset-sent"
  | "reset-password"

/** A third-party sign-in button. `id` is whatever the backend calls it. */
export type OAuthProvider = {
  id: string
  label: string
  icon?: ReactNode
}

/**
 * Submit state, supplied by the caller rather than tracked internally.
 *
 * Every form in this package is fully controlled on these two props. The
 * component knows the request is in flight and knows it failed; it does not
 * know what the request was, which is what keeps the package independent of
 * the transport underneath it.
 */
export type AuthFormStatusProps = {
  /** Request in flight — disables the form and shows the button spinner. */
  pending?: boolean
  /** Server-side failure to render above the fields. `null` clears it. */
  error?: string | null
}
