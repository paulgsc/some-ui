/**
 * The Worker's entry: wires the Cloudflare bindings into `handle`. Nothing
 * here decides an answer; `core.ts` does, and is tested without Cloudflare.
 */

import { handle } from "./core"
import { d1Store } from "./store"

type Env = {
  DB: D1Database
  // Worker secrets (`wrangler secret put`); unset until the owner sets them.
  ROUTINE_TOKEN?: string
  HOME_TOKEN?: string
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
      tokens: { routine: env.ROUTINE_TOKEN, home: env.HOME_TOKEN },
      store: d1Store(env.DB),
      now: () => new Date(),
      report,
    })
  },
} satisfies ExportedHandler<Env>
