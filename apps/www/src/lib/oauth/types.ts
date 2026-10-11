/** The shapes the OAuth client and the approval page's machine share. */

/** The query parameters an authorization request carries (RFC 6749 §4.1.1, PKCE, RFC 8707). */
export const AUTHORIZATION_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "scope",
  "state",
  "resource",
] as const

export type AuthorizationParams = Partial<
  Record<(typeof AUTHORIZATION_PARAMS)[number], string>
>

/** A request the server holds for the subject's answer, as it describes it. */
export type PendingApproval = {
  request: string
  clientName: string
  /** The host the answer goes back to, which the page shows. */
  redirectHost: string
  scopes: ReadonlyArray<string>
}

/** Refused. With `redirectTo` the service hears it; without, only the page can say it. */
export type Refusal = {
  /** OAuth's error code, e.g. `invalid_client`. */
  error: string
  description: string | null
  redirectTo: string | null
}

export type Opened =
  | { kind: "pending"; approval: PendingApproval }
  | ({ kind: "refused" } & Refusal)
