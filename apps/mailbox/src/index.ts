/**
 * The Worker's entry: wires the Cloudflare bindings into `handle`.
 */

import { handle } from "./core"
import { d1Store } from "./store"

type Env = {
  DB: D1Database
  ROUTINE_TOKEN?: string
  HOME_TOKEN?: string
  ARCHIVE_TOKEN?: string
}

/** The message only: never the request, its headers or a body (MB3). */
function report(error: unknown): void {
  // The Worker has no logger but console; `wrangler tail` shows this line.
  // eslint-disable-next-line no-console
  console.error(
    "mailbox store failed:",
    error instanceof Error ? error.message : "unknown"
  )
}

export default {
  fetch(request, env): Promise<Response> {
    return handle(request, {
      tokens: {
        routine: env.ROUTINE_TOKEN,
        home: env.HOME_TOKEN,
        archive: env.ARCHIVE_TOKEN,
      },
      store: d1Store(env.DB),
      now: () => new Date(),
      report,
    })
  },
} satisfies ExportedHandler<Env>
