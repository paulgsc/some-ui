/**
 * The learner shelf (paulgsc/server#387), over this app's `file_host`
 * transport: what a learner generated themselves and asked, per item, to
 * keep on their account, so they can replay it on another device.
 *
 * ```text
 * GET    /shelf/:activity        → { items: [{ key, contentHash, savedAt }], cap }
 * GET    /shelf/:activity/:key   → the kept body, verbatim
 * PUT    /shelf/:activity/:key   → { change, item }   the request body is the item
 * DELETE /shelf/:activity/:key   → 204
 * ```
 *
 * `@some-ui/topik` and `@some-ui/leetype` each take this as a `shelf` prop
 * (their structural `ShelfPort`; importing either would pull it into the
 * main bundle). A write is only ever a learner's tap on "Keep on this
 * account"; nothing syncs in the background (adaptive-learning canon Rem.
 * 7.3).
 *
 * Every route needs a passkey session (`401` without); an untrusted-origin
 * write is `403` (the server checks `Origin`). The refusals a learner can act
 * on arrive as a `ShelfRefusedError` with a `reason`: `full` (`409`, a new key
 * at the cap; the server never evicts), `signed-out` (`401`), `invalid`
 * (`422`, retrying cannot help). Everything else is `requestJSON`'s error.
 *
 * A build with no `file_host` gets no client, so the packages offer no shelf.
 */

import { DATA_MODE } from "@/lib/data-mode"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  FileHostResponseError,
  requestJSON,
} from "@/lib/file-host-config/client"

export type ShelfActivity = "topik" | "leetype"

type ShelfEntry = { key: string; contentHash: string; savedAt: string }

type ShelfListing = { items: Array<ShelfEntry>; cap: number }

type ShelfWritten = {
  change: "kept" | "replaced" | "unchanged"
  item: ShelfEntry
}

type ShelfClient = {
  list: () => Promise<ShelfListing>
  /** The kept body, parsed; the package validates it before playing it. */
  read: (key: string) => Promise<unknown>
  /** Keeps `body`, exactly these bytes, under `key`. */
  keep: (key: string, body: string) => Promise<ShelfWritten>
  remove: (key: string) => Promise<void>
}

/** A refusal the learner can act on; `reason` is what the packages read. */
export class ShelfRefusedError extends Error {
  constructor(
    readonly reason: "full" | "signed-out" | "invalid",
    options?: ErrorOptions
  ) {
    super(
      reason === "full"
        ? "The shelf is full: remove an item before keeping another."
        : reason === "invalid"
          ? "The shelf refused this item: too large, or not one it holds."
          : "Sign in to keep this.",
      options
    )
    this.name = "ShelfRefusedError"
  }
}

function refusalOf(error: unknown): unknown {
  if (!(error instanceof FileHostResponseError)) return error
  if (error.status === 409)
    return new ShelfRefusedError("full", { cause: error })
  if (error.status === 401) {
    return new ShelfRefusedError("signed-out", { cause: error })
  }
  // A 422 is this item, not the moment: retrying cannot help.
  if (error.status === 422) {
    return new ShelfRefusedError("invalid", { cause: error })
  }
  return error
}

/**
 * `DELETE` answers `204` with no body, the one shelf answer that is not
 * JSON; `requestJSON` decodes every answer, so that one is read as `null`.
 */
const bodilessAsNull =
  (transport: FileHostTransport): FileHostTransport =>
  async (route, init) => {
    const response = await transport(route, init)
    return response.status === 204 ? Response.json(null) : response
  }

/**
 * `transport` is a seam for tests. The default is `file_host` wherever this
 * build has one, and `null` (so no client) on the static build.
 */
export function createShelfClient(
  activity: ShelfActivity,
  transport: FileHostTransport | null = DATA_MODE === "static"
    ? null
    : createFileHostTransport("account")
): ShelfClient | undefined {
  if (transport === null) return undefined
  const through = bodilessAsNull(transport)
  const itemPath = (key: string): string =>
    `/shelf/${activity}/${encodeURIComponent(key)}`
  const request = async <T>(route: string, init?: RequestInit): Promise<T> => {
    try {
      return await requestJSON<T>(through, route, init)
    } catch (error) {
      throw refusalOf(error)
    }
  }

  return {
    list: () => request<ShelfListing>(`/shelf/${activity}`),
    read: (key) => request<unknown>(itemPath(key)),
    keep: (key, body) =>
      request<ShelfWritten>(itemPath(key), { method: "PUT", body }),
    remove: async (key): Promise<void> => {
      await request<unknown>(itemPath(key), { method: "DELETE" })
    },
  }
}
