/**
 * A game's moment log (GWB14 D15, #3039; paulgsc/server
 * `handlers/games.rs`), through the link (LA8): one `GET
 * /games/:id/moments` each time Takes, filtered to that game, reads it, and
 * again while the game is on. Nothing of the phone's is sent but the game's
 * id. What the screen makes of the answer is `lib/game-moments`'.
 */
import { homeLink } from "./index"
import type { Asked } from "./while-busy"
import { asked } from "./while-busy"

/** The path of `gameId`'s moment log. */
const gameMomentsPath = (gameId: string): string =>
  `/games/${encodeURIComponent(gameId)}/moments`

/** Asks home once for `gameId`'s moments; never rejects. */
export function askGameMoments(gameId: string): Promise<Asked> {
  return asked(() =>
    homeLink().keep((send) => send("GET", gameMomentsPath(gameId)))
  )
}
