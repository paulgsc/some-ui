/**
 * What home is told a voice note was said on (RR6, #2237): the card, as
 * `<round>:<card>`, and on a refine card the earlier note it brings back
 * too, `<round>:<card>:<note>`, so the pair is home's record (paulgsc/server
 * `voice_repo::is_rust_round_ref`). Home's `ref` takes letters, digits,
 * `-`, `_`, `.` and `:` only, so the card is joined with `:`, as LeetType's
 * `<file>:<screen>` is.
 *
 * A note is sent once and home keeps what it is told for good, so a ref
 * that names the wrong card, or a refine take without the note it refines,
 * can never be put right. Where the phone can't name the card truly, the
 * ref is null and the note waits here: on a round home holds another
 * version of (`other-round`), whose card on home is not the one played,
 * and on a card this phone's rounds don't hold (as when its record can't
 * be read), whose kind it can't tell.
 */
import type { Held } from "./held"
import { locate, playable } from "./held"
import { cardOfLine } from "./machine"

/**
 * The `ref` home is told for a note said on `line`, with the rounds `held`
 * naming what a refine card brings back; null while the note can't go home
 * named truly (above), or for a line no card makes.
 */
export function homeRef(line: string, held: Held): string | null {
  const ref = cardOfLine(line)
  if (ref === null) return null
  const otherOnHome = held.home.refused.some(
    ({ id, why }) => id === ref.round && why === "other-round"
  )
  if (otherOnHome) return null
  const card = locate(playable(held), ref)?.card
  if (card === undefined) return null
  return card.kind === "refine"
    ? `${ref.round}:${ref.card}:${card.note}`
    : `${ref.round}:${ref.card}`
}
