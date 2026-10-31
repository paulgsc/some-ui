/**
 * The game day's live socket (paulgsc/server `websocket/game_live.rs`,
 * `GET /ws/game-week`, in the server's `websocket` module): a paired phone's
 * alone. The harness speaks HTTP, not WebSocket, so what it can pin is the
 * door: who is let through to the upgrade. The messages on the socket are
 * pinned by `@some-ui/game-week`'s `live-wire.test.ts`, against the copy of
 * the server's `dump-game-live-messages` kept beside it.
 *
 * - No session at all is `401`, before any upgrade is looked at.
 * - A browser's passkey session (`session`, the cookie) is `403`: the socket
 *   takes a phone's bearer token only, offered as a `bearer.<token>`
 *   subprotocol (docs/identity.md, "Pairing a phone").
 */

import { defineContract } from "../src/contract"

export const contracts = [
  defineContract({
    id: "websocket.game_week_unpaired",
    module: "websocket",
    versioned: false,
    method: "GET",
    path: "/ws/game-week",
    summary: "the game day's live socket refuses a request with no session",
    request: {},
    expect: { status: 401 },
  }),

  defineContract({
    id: "websocket.game_week_browser",
    module: "websocket",
    versioned: false,
    session: true,
    method: "GET",
    path: "/ws/game-week",
    summary:
      "the game day's live socket refuses a browser's session: it is a paired phone's alone",
    request: {},
    expect: { status: 403 },
  }),
]
