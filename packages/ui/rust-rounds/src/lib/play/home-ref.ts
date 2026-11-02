/**
 * What home is told a voice note was said on (RR6, #2237): the card, as
 * `<round>:<card>`, and on a refine card the earlier note it brings back
 * too, `<round>:<card>:<note>`, so the pair is home's record (paulgsc/server
 * `voice_repo::is_rust_round_ref`). Home's `ref` takes letters, digits,
 * `-`, `_`, `.` and `:` only, so the card is joined with `:`, as LeetType's
 * `<file>:<screen>` is.
 */
import type { Held } from "./held"
import { locate, playable } from "./held"
import { cardOfLine } from "./machine"

/**
 * The `ref` home is told for a note said on `line`, with the rounds `held`
 * naming what a refine card brings back; null for a line no card makes.
 */
export function homeRef(line: string, held: Held): string | null {
  const ref = cardOfLine(line)
  if (ref === null) return null
  const card = locate(playable(held), ref)?.card
  return card?.kind === "refine"
    ? `${ref.round}:${ref.card}:${card.note}`
    : `${ref.round}:${ref.card}`
}
