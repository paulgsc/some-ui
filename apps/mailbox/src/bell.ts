/**
 * The bell, a Durable Object home listens on (MBP1, paulgsc/some-ui#2142).
 * The rules are `listeners.ts`'s and `core.ts`'s; this only binds them to the
 * hibernation API.
 */

// eslint-disable-next-line import/no-unresolved -- workerd's built-in module: wrangler's bundle keeps it, and @cloudflare/workers-types declares it
import { DurableObject } from "cloudflare:workers"

import { PING, PONG } from "./core"
import { admit, ringAll } from "./listeners"
import type { Folder } from "./store"

/** The one bell: the mailbox serves one owner, so there is one listener's room. */
export const BELL_NAME = "home"

export class Bell extends DurableObject<unknown> {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env)
    // Home's heartbeat is answered without waking the object, so it bills nothing.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG))
  }

  /** Home's upgrade, already checked by `core.ts` (`listen`). */
  override fetch(): Response {
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    admit(this.ctx, server)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** Called by the Worker after a put or ask that rings (`core.ts`, `RINGS`). */
  ring(folder: Folder): number {
    return ringAll(this.ctx, folder)
  }

  /** Home sends only `PING`, answered without waking; anything else is ignored. */
  override webSocketMessage(): void {
    return
  }

  /** Completes home's close; a reserved code cannot be echoed, so it is always 1000. */
  override webSocketClose(ws: WebSocket): void {
    try {
      ws.close(1000, "closed")
    } catch {
      // Ignored: the socket is already closed, which is what this asked for.
    }
  }
}
