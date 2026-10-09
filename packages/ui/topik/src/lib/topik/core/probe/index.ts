/**
 * Morphism probes, as a renderer needs them: labels, a stable option order,
 * and grading - all pure, so the component only renders (canon Def. 9.1).
 *
 * A probe's candidates and their validity are authored (canon Rem. 4.7);
 * grading is therefore a lookup, never a judgement made here.
 */

import { seedOf, shuffledBySeed } from "@some-ui/core-utils"
import type { MorphismRelation, Probe, ProbeOption } from "@topik/lib/topik"

/**
 * Chips for the relations probes most often name. Any other relation is its
 * own chip, as its author wrote it (canon Rem. 4.8).
 */
const RELATION_LABELS: Record<string, string> = {
  past: "Past tense",
  future: "Future",
  negation: "Negation",
  question: "Question",
  paraphrase: "Same meaning",
  register: "Politeness",
  reply: "Reply",
  situation: "Situation",
  gloss: "Meaning",
}

/** The chip on a candidate: the authored label, else the relation's. */
export function relationLabel(
  relation: MorphismRelation,
  override?: string
): string {
  return override ?? RELATION_LABELS[relation] ?? relation
}

/**
 * Options in a stable, seeded order. Authors tend to write the valid reply
 * first, or the broken transformation last; the order they wrote in must not
 * be a tell. Seeded, so a re-render or a resumed lesson keeps its order.
 */
export function orderedOptions(
  probe: Probe,
  seedKey: string
): Array<ProbeOption> {
  return shuffledBySeed(probe.options, seedOf(seedKey))
}

/**
 * Whether choosing `option` answers the probe: the one invalid candidate of
 * an odd-one-out, or the one valid candidate of a pick-valid.
 */
export function isCorrectChoice(probe: Probe, option: ProbeOption): boolean {
  return probe.kind === "odd-one-out" ? !option.valid : option.valid
}

/**
 * Whether candidates carry their relation as a chip. On an odd-one-out the
 * chip *is* the claim being judged ("Past tense: 가사가 예뻤어요") and the item
 * is unreadable without it; on a pick-valid every option answers the same
 * prompt, and a chip would only label - or leak - what the prompt asks.
 */
export function showsRelations(probe: Probe): boolean {
  return probe.kind === "odd-one-out"
}
