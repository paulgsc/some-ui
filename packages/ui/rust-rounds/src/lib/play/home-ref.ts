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
 * can never be put right. So a card is named only on a round home holds as
 * this phone plays it: the worked example, one home took from here
 * (`sent`), or one taken from home (`fetched`). Any other ref is null and
 * the note waits here: on a round not yet sent, or one home did not take
 * (`refused`: home may hold another round under its id, `other-round`, and
 * it reads a round before it looks for one, so `not-taken` can't rule that
 * out), whose card on home may not be the one played; and on a card this
 * phone's rounds don't hold (as when its record can't be read), whose kind
 * it can't tell.
 */
import { INDEXING_01 } from "@rust-rounds/lib/worked-example"

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
  const { sent, fetched } = held.home
  const asPlayed =
    ref.round === INDEXING_01.id ||
    sent.includes(ref.round) ||
    fetched.includes(ref.round)
  if (!asPlayed) return null
  const card = locate(playable(held), ref)?.card
  if (card === undefined) return null
  return card.kind === "refine"
    ? `${ref.round}:${ref.card}:${card.note}`
    : `${ref.round}:${ref.card}`
}
