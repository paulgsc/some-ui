/**
 * Where LeetType's rounds come from in this app (H1, #1231; canon
 * Rem. 11.4).
 *
 * - **`server` mode** (`vite dev`, `vite preview`, Docker): `file_host`'s
 *   round routes (paulgsc/server#327). `GET /api/v1/leetype/rounds` lists the
 *   served rounds; each body is `GET /api/v1/leetype/rounds/:id`, verbatim,
 *   the bytes the importer or the round CRM stored.
 * - **`static` mode** (GitHub Pages): no `file_host`, so no request at all.
 *   This resolves empty and `Leetype` plays its bundled, reviewed rounds.
 *
 * # Failing open, on purpose
 *
 * `sessions-backend` fails loudly on an unreachable server, because a write
 * that silently goes nowhere is lost work. This is a read of a practice
 * corpus the package already carries a reviewed copy of, the same
 * read-versus-write reasoning #1043 recorded for the activity catalogue: a
 * rejected promise here makes `Leetype` play the bundled rounds, and a body
 * that fails to arrive is simply not played. Nothing is lost that a learner
 * could have kept.
 *
 * # Bounded
 *
 * A session plays a handful of rounds, and the manifest may list up to
 * `file_host`'s ceiling of them, so this fetches the bodies of at most
 * `MAX_FETCHED_ROUNDS`, chosen at random per session so that variety across
 * sessions survives a large corpus.
 *
 * Nothing here imports `@some-ui/leetype`: that would put the activity in this
 * app's main bundle and undo the content registry's lazy import. The shape
 * checked below only tells a manifest from something that is not one; the
 * package parses each round with its own `RoundSchema` on the way in.
 */

import { createDataSource } from "@some-ui/fetch-kit"
import { z } from "zod"

import { DATA_MODE, FETCHES_CONTENT } from "@/lib/data-mode"
import { fileHostRouteUrl } from "@/lib/file-host-config"

/** How many round bodies one session fetches, at most. */
export const MAX_FETCHED_ROUNDS = 24

function toUrl(located: string | undefined): URL {
  if (located === undefined) {
    throw new Error("No file_host base URL outside a browser")
  }
  return new URL(located, window.location.origin)
}

const locateManifestUrl = (): URL =>
  toUrl(fileHostRouteUrl("/api/v1/leetype/rounds"))

const locateRoundUrl = (id: string): URL =>
  toUrl(fileHostRouteUrl("/api/v1/leetype/rounds/:id", { id }))

/**
 * Hand-written, per #1042: the part of paulgsc/server's round manifest this
 * loader reads. The rest of each entry (`version`, `contentHash`,
 * `witnesses`) is the server's to add to without breaking this.
 */
const RoundManifestSchema = z.object({
  version: z.string(),
  rounds: z.array(z.object({ id: z.string().min(1) })),
})

// The `static` locators are never reached - `FETCHES_CONTENT` gates every
// request below - but `createDataSource` wants one per mode.
const manifestSource = createDataSource<
  void,
  z.infer<typeof RoundManifestSchema>
>({ static: locateManifestUrl, server: locateManifestUrl }, { mode: DATA_MODE })

const roundSource = createDataSource<string, unknown>(
  { static: locateRoundUrl, server: locateRoundUrl },
  { mode: DATA_MODE }
)

/** A uniform pick of `count` ids, without replacement. */
function sample(ids: ReadonlyArray<string>, count: number): Array<string> {
  const pool = [...ids]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = pool[index]
    pool[index] = pool[swap]!
    pool[swap] = current
  }
  return pool.slice(0, count)
}

/** Handed to `Leetype` as `loadRounds`. Resolves to raw round bodies. */
export async function loadLeetypeRounds(): Promise<ReadonlyArray<unknown>> {
  if (!FETCHES_CONTENT) return []
  const manifest = await manifestSource.fetch(undefined, RoundManifestSchema)
  const ids = sample(
    manifest.rounds.map((round) => round.id),
    MAX_FETCHED_ROUNDS
  )
  const bodies = await Promise.allSettled(
    ids.map((id) => roundSource.fetch(id))
  )
  return bodies.flatMap((body) =>
    body.status === "fulfilled" ? [body.value] : []
  )
}
