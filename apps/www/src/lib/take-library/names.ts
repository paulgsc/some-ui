/**
 * What this phone can name that a take's ref only points at, for Takes'
 * about lines (TAKES20): a game bite's scenario, by the catalog the phone
 * plays (`@some-ui/game-week`'s `scenarioName`). A game is named by home's
 * read, or else the day it was played: the phone keeps no week's games
 * between visits. An interview week's question is named by its id.
 */
import { scenarioName } from "@some-ui/game-week"
import type { TakeNames } from "@some-ui/soundbites"

export const takeNames: TakeNames = {
  game: () => null,
  scenario: scenarioName,
  question: () => null,
}
