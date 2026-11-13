/**
 * The Worker's entry: wires the Cloudflare bindings into `handle`.
 */

import type { Bell } from "./bell"
import { BELL_NAME } from "./bell"
import { handle } from "./core"
import { d1Store } from "./store"

export { Bell } from "./bell"

type Env = {
  DB: D1Database
  BELL: DurableObjectNamespace<Bell>
  ROUTINE_TOKEN?: string
  HOME_TOKEN?: string
  ARCHIVE_TOKEN?: string
}

/** The message only: never the request, its headers or a body (MB3). */
function report(error: unknown): void {
  // The Worker has no logger but console; `wrangler tail` shows this line.
  // eslint-disable-next-line no-console
  console.error(
    "mailbox failed:",
    error instanceof Error ? error.message : "unknown"
  )
}

export default {
  fetch(request, env, ctx): Promise<Response> {
    // A stub is a name, not a request: making one costs nothing.
    const bell = env.BELL.get(env.BELL.idFromName(BELL_NAME))
    return handle(request, {
      tokens: {
        routine: env.ROUTINE_TOKEN,
        home: env.HOME_TOKEN,
        archive: env.ARCHIVE_TOKEN,
      },
      store: d1Store(env.DB),
      now: () => new Date(),
      report,
      bell: {
        listen: (upgrade) => bell.fetch(upgrade),
        // After the answer is sent: the put never waits on the ring.
        ring: (folder): void => {
          ctx.waitUntil(bell.ring(folder).then(() => undefined, report))
        },
      },
    })
  },
} satisfies ExportedHandler<Env>
