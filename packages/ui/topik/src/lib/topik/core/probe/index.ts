/**
 * Morphism probes, as a renderer needs them: a stable option order and
 * grading - all pure, so the component only renders (canon Def. 9.1).
 *
 * A probe's candidates and their validity are authored (canon Rem. 4.7);
 * grading is therefore a lookup, never a judgement made here.
 */

import { fnv1a, shuffledBySeed } from "@some-ui/core-utils"
import type { Probe, ProbeOption } from "@topik/lib/topik/entity/topik-types"

/**
 * Options in a stable, seeded order. Authors tend to write the valid reply
 * first, or the broken transformation last; the order they wrote in must not
 * be a tell. Seeded, so a re-render or a resumed lesson keeps its order.
 */
export function orderedOptions(
  probe: Probe,
  seedKey: string
): Array<ProbeOption> {
  return shuffledBySeed(probe.options, fnv1a(seedKey))
}

/**
 * Whether the probe's pick is a line the point of view bites back: an
 * odd-one-out's answer is the one line she must not say.
 */
export const bitesBack = (probe: Probe): boolean => probe.kind === "odd-one-out"

/**
 * Whether choosing `option` answers the probe: the one invalid candidate of
 * an odd-one-out, or the one valid candidate of a pick-valid.
 */
export function isCorrectChoice(probe: Probe, option: ProbeOption): boolean {
  return probe.kind === "odd-one-out" ? !option.valid : option.valid
}
