/**
 * OAuth for AI services acting for a subject (paulgsc/server
 * `handlers/oauth.rs`; its `docs/identity.md`, "AI services acting for a
 * subject"), over this app's `file_host` transport. Two clients, by page:
 *
 * ```text
 * the approval page (/connect), its "ceremony" transport:
 * POST   /oauth/authorize/requests              the AI service's query, as received
 *          → { request, clientName, redirectHost, scopes }
 *          → 400 { error, error_description }   refused, nowhere to send it back
 *          → 400 { error, redirectTo }          refused, back to the service
 * POST   /oauth/authorize/requests/:id/approve  → { redirectTo }  401 signed out, 404 gone
 * POST   /oauth/authorize/requests/:id/deny     → { redirectTo }  no session needed, 404 gone
 *
 * Settings → Connected AI services, its "account" transport:
 * GET    /oauth/grants                          → { grants: [{ id, clientName, scopes }] }
 * DELETE /oauth/grants/:grant                   → 204, held or not
 * ```
 *
 * The first route's refusals are OAuth's own (RFC 6749 §5.2), not
 * `file_host`'s `{ error: { code } }` envelope, and `requestJSON` keeps only
 * the envelope's code. So that route's transport reads a refusal into an
 * ordinary answer (`refusalAsAnswer`) before `requestJSON` sees it. Every
 * other failure, the approve and deny `404`s included, is `requestJSON`'s own
 * error.
 *
 * A build with no `file_host` (the GitHub Pages build, or no `window`) gets no
 * client, so the page says there is nothing to connect to.
 */

import { DATA_MODE } from "@/lib/data-mode"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  bodilessAsNull,
  createFileHostTransport,
  requestJSON,
} from "@/lib/file-host-config/client"

import type {
  AuthorizationParams,
  Opened,
  PendingApproval,
  Refusal,
} from "./types"

export type ApprovalClient = {
  open: (params: AuthorizationParams) => Promise<Opened>
  /** Where to send the browser: the service's redirect, with a code or `access_denied`. */
  answer: (request: string, answer: "approve" | "deny") => Promise<string>
}

export type ConnectedService = {
  id: string
  clientName: string
  scopes: ReadonlyArray<string>
}

export type GrantsClient = {
  list: () => Promise<ReadonlyArray<ConnectedService>>
  disconnect: (grant: string) => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

const str = (value: unknown): string | null =>
  typeof value === "string" ? value : null

/**
 * An OAuth refusal, read as a `200 { refused }` answer. `file_host`'s own
 * envelope (`error` an object) and anything that is not JSON pass through to
 * `requestJSON` unchanged.
 */
const refusalAsAnswer =
  (transport: FileHostTransport): FileHostTransport =>
  async (route, init) => {
    const response = await transport(route, init)
    if (response.ok) return response
    let body: unknown
    try {
      body = await response.clone().json()
    } catch {
      return response
    }
    if (!isRecord(body) || typeof body.error !== "string") return response
    const refused: Refusal = {
      error: body.error,
      description: str(body.error_description),
      redirectTo: str(body.redirectTo),
    }
    return new Response(JSON.stringify({ refused }), {
      headers: { "content-type": "application/json" },
    })
  }

const POST = { method: "POST", body: "{}" } as const

/**
 * `transport` is a seam for tests. The default is `file_host`'s ceremony
 * transport: approving is the person's own explicit act, made whichever
 * authority holds their sessions, like signing in.
 */
export function createApprovalClient(
  transport: FileHostTransport | null = DATA_MODE === "static"
    ? null
    : createFileHostTransport("ceremony")
): ApprovalClient | undefined {
  if (transport === null) return undefined
  const opening = refusalAsAnswer(transport)
  return {
    open: async (params): Promise<Opened> => {
      const answer = await requestJSON<PendingApproval | { refused: Refusal }>(
        opening,
        "/oauth/authorize/requests",
        {
          method: "POST",
          body: JSON.stringify(params),
        }
      )
      return "refused" in answer
        ? { kind: "refused", ...answer.refused }
        : { kind: "pending", approval: answer }
    },
    answer: async (request, answer): Promise<string> => {
      const { redirectTo } = await requestJSON<{ redirectTo: string }>(
        transport,
        `/oauth/authorize/requests/${encodeURIComponent(request)}/${answer}`,
        POST
      )
      return redirectTo
    },
  }
}

/** `transport` is a seam for tests; the default follows `createShelfClient`'s. */
export function createGrantsClient(
  transport: FileHostTransport | null = DATA_MODE === "static"
    ? null
    : createFileHostTransport("account")
): GrantsClient | undefined {
  if (transport === null) return undefined
  const through = bodilessAsNull(transport)
  return {
    list: async (): Promise<ReadonlyArray<ConnectedService>> =>
      (
        await requestJSON<{ grants: Array<ConnectedService> }>(
          through,
          "/oauth/grants"
        )
      ).grants,
    disconnect: async (grant): Promise<void> => {
      await requestJSON<null>(
        through,
        `/oauth/grants/${encodeURIComponent(grant)}`,
        { method: "DELETE" }
      )
    },
  }
}
