/**
 * Morphism probes, as a renderer needs them: labels, a stable option order,
 * and grading - all pure, so the component only renders (canon Def. 9.1).
 *
 * A probe's candidates and their validity are authored (canon Rem. 4.7);
 * grading is therefore a lookup, never a judgement made here.
 */

import type {
  Message,
  MorphismRelation,
  Probe,
  ProbeOption,
} from "@topik/lib/topik"
import {
  MAX_TILES,
  seededShuffle,
  tokenize,
} from "@topik/lib/topik/core/tile-assembly"

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

export type ChoiceProbe = Extract<Probe, { options: Array<ProbeOption> }>

/**
 * Options in a stable, seeded order. Authors tend to write the valid reply
 * first, or the broken transformation last; the order they wrote in must not
 * be a tell. Seeded, so a re-render or a resumed lesson keeps its order.
 */
export function orderedOptions(
  probe: ChoiceProbe,
  seedKey: string
): Array<ProbeOption> {
  return seededShuffle(probe.options, seedKey)
}

/**
 * Whether choosing `option` answers the probe: the one invalid candidate of
 * an odd-one-out, or the one valid candidate of a pick-valid.
 */
export function isCorrectChoice(
  probe: ChoiceProbe,
  option: ProbeOption
): boolean {
  return probe.kind === "odd-one-out" ? !option.valid : option.valid
}

/** Accepted forms of a build probe's target, the canonical one first. */
export function acceptedForms(
  probe: Extract<Probe, { kind: "build" }>
): Array<string> {
  return [...new Set([probe.target, ...(probe.acceptedAnswers ?? [])])]
}

/**
 * Whether candidates carry their relation as a chip. On an odd-one-out the
 * chip *is* the claim being judged ("Past tense: 가사가 예뻤어요") and the item
 * is unreadable without it; on a pick-valid every option answers the same
 * prompt, and a chip would only label - or leak - what the prompt asks.
 */
export function showsRelations(probe: ChoiceProbe): boolean {
  return probe.kind === "odd-one-out"
}

/** A line as it is read and heard: its Korean, else its content. */
export const lineText = (message: Message): string =>
  message.korean || message.content

const collapse = (text: string): string => text.replace(/\s+/g, "").trim()

/**
 * Which line an item is about: the line it declares (`anchorMessageId`),
 * else the first whose Korean contains the item's excerpt or is contained by
 * it, else the last. A heuristic, since anchoring is pacing, not belief
 * (canon Cor. 4.4 (ii)).
 */
export function anchorOf(
  item: { anchorMessageId?: string; excerpt?: string },
  messages: Array<Message>
): number {
  if (messages.length === 0) return -1

  if (item.anchorMessageId !== undefined) {
    const declared = messages.findIndex(
      (message) => message.id === item.anchorMessageId
    )
    if (declared !== -1) return declared
  }

  const excerpt = collapse(item.excerpt ?? "")
  if (excerpt.length > 0) {
    const matched = messages.findIndex((message) => {
      const line = collapse(lineText(message))
      return (
        line.length > 0 && (line.includes(excerpt) || excerpt.includes(line))
      )
    })
    if (matched !== -1) return matched
  }

  return messages.length - 1
}

/**
 * Whether a build probe's target tiles within `MAX_TILES` (canon Def. 4.5);
 * any other probe is deliverable.
 */
export function isDeliverable(probe: Probe): boolean {
  if (probe.kind !== "build") return true
  // The target is the form the board tiles; alternatives are only graded.
  const split = tokenize(probe.target)
  return split !== null && split.tokens.length <= MAX_TILES
}
