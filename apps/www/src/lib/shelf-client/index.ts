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
 * (their `ShelfPort`, written out structurally there as the shapes are here:
 * importing either package would put it in this app's main bundle and undo
 * the content registry's lazy import). Neither package calls it unasked:
 * a write is a learner's tap on "Keep on this account", and nothing here
 * syncs in the background (adaptive-learning canon Rem. 7.3).
 *
 * Every route needs a passkey session and answers `401` without one; a
 * write from an untrusted origin is `403` (the server checks `Origin`, which
 * the browser sends; there is no token to add). Three refusals are ones the
 * learner can act on, so they arrive as a `ShelfRefusedError` whose `reason`
 * the packages read: `full` (`409`, a new key on a shelf at its cap, which
 * the server never evicts from), `signed-out` (`401`) and `invalid` (`422`,
 * an item the shelf will not hold, which retrying cannot change).
 * Everything else is `requestJSON`'s own error.
 *
 * A build with no `file_host` (the GitHub Pages build, or no `window`) gets
 * no client at all, so the packages offer no shelf rather than one that
 * always fails.
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
    // `new Response`, not `Response.json`: the static method is missing
    // before Safari 17, where it would turn a done DELETE into a failure.
    return response.status === 204
      ? new Response("null", {
          headers: { "content-type": "application/json" },
        })
      : response
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
