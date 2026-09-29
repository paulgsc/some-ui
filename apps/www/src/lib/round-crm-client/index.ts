/**
 * `@some-ui/lesson-crm`'s round client (`RoundCrmClient`), over this app's
 * `file_host` transport, as `lib/lesson-crm-client` is for lessons. It
 * imports nothing from `@some-ui/lesson-crm`, whose audience is `lan`; the
 * shapes are written out and checked structurally where the round CRM route
 * hands this to `RoundCrm`.
 *
 * The operator routes answer 401 without a passkey session and 403 to a
 * subject not in the server's `OPERATOR_SUBJECTS`; `requestJSON` maps both
 * like any other `file_host` error, so the CRM's toast says which.
 */

import type {
  FileHostTransport,
  RequestOptions,
} from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  requestJSON,
} from "@/lib/file-host-config/client"

type OperatorRound = {
  id: string
  version: number
  publishedAt: string
  contentHash: string
  witnesses: Array<{ propositionId: string; admissible: boolean }>
  retiredAt: string | null
}

type RoundWritten = {
  change: "inserted" | "contentChanged" | "unchanged"
  round: OperatorRound
}

const roundPath = (id: string): string =>
  `/leetype/operator/rounds/${encodeURIComponent(id)}`

/**
 * `transport` is a seam for tests; the default resolves `file_host` the way
 * every caller in this app does. A build with no `file_host` gets a client
 * whose every call rejects, saying so.
 */
export function createRoundCrmClient(
  transport: FileHostTransport | null = createFileHostTransport()
): {
  list: () => Promise<Array<OperatorRound>>
  read: (id: string) => Promise<string>
  write: (id: string, body: string) => Promise<RoundWritten>
  retire: (id: string) => Promise<OperatorRound>
  restore: (id: string) => Promise<OperatorRound>
} {
  const request = <T>(
    route: string,
    init?: RequestInit,
    options?: RequestOptions
  ): Promise<T> =>
    transport
      ? requestJSON<T>(transport, route, init, options)
      : Promise.reject(new Error("This build has no file_host to talk to."))

  return {
    list: async () =>
      (
        await request<{ rounds: Array<OperatorRound> }>(
          "/leetype/operator/rounds"
        )
      ).rounds,
    // The body comes back parsed; the CRM re-checks and re-serializes it
    // (`serializeRound`) before any save, so the stored bytes' layout here
    // does not matter. The public round module answers CORS without
    // credentials, so this read is same-origin only, as the lesson read is.
    read: async (id) =>
      JSON.stringify(
        await request<unknown>(`/leetype/rounds/${encodeURIComponent(id)}`, {
          credentials: "same-origin",
        })
      ),
    write: (id, body) =>
      request<RoundWritten>(roundPath(id), {
        method: "PUT",
        body: JSON.stringify({ body }),
      }),
    // POSTs that set a state rather than mint one: repeating either
    // converges, so a timed-out one may be retried.
    retire: (id) =>
      request<OperatorRound>(
        `${roundPath(id)}/retire`,
        { method: "POST" },
        { idempotent: true }
      ),
    restore: (id) =>
      request<OperatorRound>(
        `${roundPath(id)}/restore`,
        { method: "POST" },
        { idempotent: true }
      ),
  }
}
