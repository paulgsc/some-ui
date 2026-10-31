/**
 * The phone's one WebSocket to its home server: the game day's live socket
 * (GWB4, LA16 in docs/learner-data-authority.md). Native HTTP has no
 * socket, so this is the one file besides the native-HTTP module that
 * reaches home, and the one that names `WebSocket` (LA1's exemption list).
 *
 * - **`wss:` only.** The pairing's token goes in the handshake, so a URL
 *   that is not `wss:` is refused before anything is opened.
 * - **The token is offered as a subprotocol** (`bearer.<token>`, beside
 *   `game-week.v1`), since a page cannot set `Authorization` on a socket;
 *   home answers `game-week.v1` alone.
 * - **It decides nothing.** `./live` opens and closes it and reads what it
 *   says; a close this side asked for is not reported back.
 */

/** The subprotocol home answers: version 1 of the messages. */
const PROTOCOL = "game-week.v1"

/** A credentialed socket to a URL that is not `wss:`. Nothing was opened. */
class InsecureLiveError extends Error {
  constructor() {
    super("the home server's credential is sent over wss only")
    this.name = "InsecureLiveError"
  }
}

export type LiveSocket = {
  /** Sends one text frame, or nothing while the socket is not open. */
  send: (text: string) => void
  /** Closes it; `closed` is not called for a close asked for here. */
  close: () => void
}

export type LiveSocketEvents = {
  opened: () => void
  message: (text: string) => void
  /** Home closed it, or it failed: the close code (1006 for no answer). */
  closed: (code: number) => void
}

export function openLiveSocket(
  url: string,
  token: string,
  on: LiveSocketEvents
): LiveSocket {
  if (new URL(url).protocol !== "wss:") throw new InsecureLiveError()
  const socket = new WebSocket(url, [PROTOCOL, `bearer.${token}`])
  socket.onopen = (): void => on.opened()
  socket.onmessage = (event: MessageEvent): void => {
    if (typeof event.data === "string") on.message(event.data)
  }
  socket.onclose = (event: CloseEvent): void => on.closed(event.code)
  return {
    send(text): void {
      if (socket.readyState === WebSocket.OPEN) socket.send(text)
    },
    close(): void {
      socket.onopen = null
      socket.onmessage = null
      socket.onclose = null
      socket.close(1000)
    },
  }
}
