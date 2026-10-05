/**
 * `@some-ui/lesson-crm`'s round client (`RoundCrmClient`), as
 * `lib/lesson-crm-client` is for lessons: no imports from the `lan`
 * workspace, shapes checked structurally where the route passes it in.
 * Operator routes answer 401 without a session and 403 outside
 * `OPERATOR_SUBJECTS`; the CRM's toast says which.
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
 * `transport` is a seam for tests. A build with no `file_host` gets a client
 * whose every call rejects, saying so.
 */
export function createRoundCrmClient(
  transport: FileHostTransport | null = createFileHostTransport("account")
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
    // Parsed on the way; the CRM re-checks and re-serializes (`serializeRound`)
    // before saving. The public round module is uncredentialed, so this read
    // is same-origin only.
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
