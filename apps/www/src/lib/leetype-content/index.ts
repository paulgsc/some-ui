/**
 * Where LeetType's rounds come from in this app (H1, #1231; canon
 * Rem. 11.4).
 *
 * - **`server` mode**: `file_host`'s round routes (paulgsc/server#327):
 *   `GET /api/v1/leetype/rounds` lists them; each body is
 *   `GET /api/v1/leetype/rounds/:id`, verbatim.
 * - **`static` mode** (Pages): no request; this resolves empty and `Leetype`
 *   plays its bundled, reviewed rounds.
 *
 * A round's recorded runs (X2, #1223; paulgsc/server#381) follow the same
 * split (`/rounds/:id/runs`, or the package's bundled `corpus/runs/`). The
 * package shows them only if recorded for the exact bytes being played.
 *
 * Fails open, unlike `sessions-backend`: this reads a practice corpus the
 * package already carries, so a rejection means the bundled rounds play and
 * nothing a learner could keep is lost.
 *
 * Bounded: at most `MAX_FETCHED_ROUNDS` bodies, picked at random per session
 * so variety survives a large corpus.
 *
 * Nothing here imports `@some-ui/leetype` (it would join the main bundle);
 * the package parses each round with its own `RoundSchema`.
 */

import { createDataSource } from "@some-ui/fetch-kit"
import { z } from "zod"

import { DATA_MODE, FETCHES_CONTENT } from "@/lib/data-mode"
import { fileHostRouteUrl, PUBLIC_READ } from "@/lib/file-host-config"

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
 * Hand-written (#1042): the part of the server's round manifest this loader
 * reads; the server may add fields freely.
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
>(
  { static: locateManifestUrl, server: locateManifestUrl },
  { mode: DATA_MODE, fetchOptions: PUBLIC_READ }
)

const roundSource = createDataSource<string, unknown>(
  { static: locateRoundUrl, server: locateRoundUrl },
  { mode: DATA_MODE, fetchOptions: PUBLIC_READ }
)

const locateRunsUrl = (id: string): URL =>
  toUrl(fileHostRouteUrl("/api/v1/leetype/rounds/:id/runs", { id }))

/**
 * How long a round waits for its runs before the package falls back to the
 * bundled transcript. Never retried: runs are shown only after the learner
 * commits, and a round never waits on them.
 */
const RUNS_TIMEOUT_MS = 5_000

const runsSource = createDataSource<string, unknown>(
  { static: locateRunsUrl, server: locateRunsUrl },
  {
    mode: DATA_MODE,
    fetchOptions: {
      ...PUBLIC_READ,
      timeout: RUNS_TIMEOUT_MS,
      retry: { count: 0, delay: 0 },
    },
  }
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

/**
 * Handed to `Leetype` as `loadRuns`: the raw body of a round's recorded runs,
 * or `null` in a static build with no request. Fails open: any rejection
 * shows the bundled transcript or no runs, and a round never needs a run to
 * play (X5's never #4).
 */
export async function loadLeetypeRoundRuns(roundId: string): Promise<unknown> {
  if (!FETCHES_CONTENT) return null
  return runsSource.fetch(roundId)
}
