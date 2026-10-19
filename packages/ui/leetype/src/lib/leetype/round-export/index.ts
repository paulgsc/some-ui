import type { Round } from "@leetype/types/authored-round"
import { RoundSchema } from "@leetype/types/authored-round"

/**
 * The one serialization of a round that leaves this repository. The
 * server stores a round's body verbatim (`paulgsc/server`'s
 * `leetype_round.body`) and hashes it to decide whether a round changed,
 * so this function's bytes are the bytes a learner fetches: the round CRM
 * PUTs them. Two-space JSON plus a trailing newline, the shape the
 * lesson CRM's `servedBody` already uses for TOPIK.
 *
 * Canonical: the round goes through `RoundSchema` first, whose output
 * orders every object's keys as the schema declares them (and drops keys
 * it does not know). An authored literal and the same round parsed from a
 * model's reply therefore serialize to the same bytes, whatever order
 * either wrote its keys in, and the server sees one version, not two.
 */
export function serializeRound(round: Round): string {
  return `${JSON.stringify(RoundSchema.parse(round), null, 2)}\n`
}
