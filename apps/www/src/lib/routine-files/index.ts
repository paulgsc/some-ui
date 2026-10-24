/**
 * What the reflections routine left on home for this account
 * (paulgsc/server `GET /routine/files`): its word sets and dramas, through
 * the Jobs mailbox. `@some-ui/topik` takes this as `routineFiles` and lists
 * the ones not opened yet under "From the routine"; it parses the answer
 * itself (`adapter/routine-files`).
 *
 * ```text
 * GET /routine/files → { files: [{ folder, name, file }], runs: [...], at }, newest first
 * ```
 *
 * Read only, and only with a passkey session (`401` without). A build with
 * no `file_host` gets no client, so topik lists none. Nor does the Android
 * app: its account is the phone's own backend, and home is reached only
 * through the home link (docs/learner-data-authority.md, LA8), so the app
 * reads these files there, with the pairing's key, once its person chose
 * to show them (`lib/home-link/routine`, LA12).
 */

import { MOBILE_APP } from "@/lib/build-profile"
import { DATA_MODE } from "@/lib/data-mode"
import type { FileHostTransport } from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  requestJSON,
} from "@/lib/file-host-config/client"

type RoutineFilesClient = {
  /** Home's answer, as it came. */
  list: () => Promise<unknown>
}

/**
 * `transport` is a seam for tests. The default is `file_host` wherever this
 * build has one, and `null` (so no client) on the static build and the app.
 */
export function createRoutineFilesClient(
  transport: FileHostTransport | null = DATA_MODE === "static" || MOBILE_APP
    ? null
    : createFileHostTransport("account")
): RoutineFilesClient | undefined {
  if (transport === null) return undefined
  return { list: () => requestJSON<unknown>(transport, "/routine/files") }
}
