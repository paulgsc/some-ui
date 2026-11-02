/**
 * What home is told a voice note was said on (RR6, #2237): the card, as
 * `<round>:<card>`, and on a refine card the earlier note it brings back
 * too, `<round>:<card>:<note>`, so the pair is home's record (paulgsc/server
 * `voice_repo::is_rust_round_ref`). Home's `ref` takes letters, digits,
 * `-`, `_`, `.` and `:` only, so the card is joined with `:`, as LeetType's
 * `<file>:<screen>` is. Pure: the voice lane (`apps/www`'s
 * `lib/home-link/voice-copy`) reads it.
 */
import type { Round } from "@rust-rounds/lib/formats"

import type { Held } from "./held"
import { playable } from "./held"

/** `lineOf`'s shape (`./machine`): `rust-rounds:<round>/<card>`. */
const LINE =
  /^rust-rounds:([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/

/**
 * The `ref` home is told for a note said on `line`, with the rounds `held`
 * naming what a refine card brings back; null for a line no card makes.
 */
export function homeRef(line: string, held: Held): string | null {
  const [, round, card] = LINE.exec(line) ?? []
  if (round === undefined || card === undefined) return null
  const refines = refinedNote(playable(held), round, card)
  return refines === null ? `${round}:${card}` : `${round}:${card}:${refines}`
}

/** The earlier note refine card `card` of `round` brings back; null for any other card. */
function refinedNote(
  rounds: ReadonlyArray<Round>,
  round: string,
  card: string
): string | null {
  const found = rounds
    .find((each) => each.id === round)
    ?.cards.find((each) => each.id === card)
  return found?.kind === "refine" ? found.note : null
}
