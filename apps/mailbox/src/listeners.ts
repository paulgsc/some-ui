/**
 * The bell's listeners, over the part of a Durable Object's state the
 * hibernation API gives it, so the rules run in Node tests with no workerd:
 * one listener at a time, and a ring that carries only a folder name (MB6).
 */

import { REPLACED, RINGING, ringMessage } from "./core"
import type { Folder } from "./store"

/** What the bell uses of a hibernated `WebSocket`. */
export type Listener = {
  readonly send: (message: string) => void
  readonly close: (code: number, reason: string) => void
}

/** What the bell uses of `DurableObjectState`. */
export type Sockets<S extends Listener> = {
  readonly getWebSockets: () => Array<S>
  readonly acceptWebSocket: (ws: S) => void
}

/**
 * Takes a new listener. Every earlier one is closed first, so home has one
 * socket at a time. It is accepted hibernating (`acceptWebSocket`, never
 * `ws.accept()`), so an open socket bills no duration.
 */
export function admit<S extends Listener>(
  sockets: Sockets<S>,
  server: S
): void {
  for (const earlier of sockets.getWebSockets()) {
    try {
      earlier.close(REPLACED, "replaced")
    } catch {
      // Ignored: it is already closing, and a closing socket hears no more rings.
    }
  }
  sockets.acceptWebSocket(server)
}

/**
 * Rings every listener with `folder` and says how many it reached. A folder
 * no ring may name is sent to no one. With no listener the ring is dropped:
 * home's pass on its next connection or poll catches up.
 */
export function ringAll<S extends Listener>(
  sockets: Sockets<S>,
  folder: Folder
): number {
  if (!RINGING.has(folder)) return 0
  const message = ringMessage(folder)
  let reached = 0
  for (const listener of sockets.getWebSockets()) {
    try {
      listener.send(message)
      reached += 1
    } catch {
      // Ignored: the socket closed as the ring went out; home's pass on its
      // next connection catches up what it missed.
    }
  }
  return reached
}
