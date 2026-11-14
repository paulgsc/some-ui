/**
 * The stamp (CARDS4, #2469): `as of <repo>@<commit> · <date>` at every
 * card's foot, so a video that goes stale says how stale it is. It is
 * written once, as the cut list's `stamp` (the commits its cards were
 * checked against, and the day), and the renderer gives it to each card
 * (`@some-ui/burn-ins`' terminal, cheat sheet, legend, rule and flow cards) as
 * its `stamp` param. Changing the pin re-stamps every card; nothing is
 * typed per card (`stampProblems`).
 */

import type { BurnIn, CutList } from "./cut-list"

/** The param the renderer writes: the cut list's stamp. */
const STAMP = "stamp"

/** The burn-in kinds that are cards, each drawing the stamp at its foot. */
const CARD_KINDS: ReadonlySet<string> = new Set([
  "terminal",
  "cheat-sheet",
  "legend",
  "rule",
  "flow",
])

const isCard = (b: BurnIn): boolean => CARD_KINDS.has(b.kind)

/** Each scene's burn-ins, each card with the cut list's stamp. */
export function withStamp(
  cut: CutList,
  burnIns: ReadonlyArray<ReadonlyArray<BurnIn>>
): ReadonlyArray<ReadonlyArray<BurnIn>> {
  const stamp = cut.stamp
  if (stamp === undefined) return burnIns
  return burnIns.map((scene) =>
    scene.map((b) =>
      isCard(b) ? { ...b, params: { ...b.params, [STAMP]: stamp } } : b
    )
  )
}

/**
 * A card takes its stamp from the cut list, so the cut list has one when
 * it has a card, and no card writes its own; a card belongs to a scene.
 */
export function stampProblems(cut: CutList): Array<string> {
  const scenes = cut.shots.filter((s) => s.burnIns.some(isCard))
  return [
    ...scenes.flatMap((s) =>
      s.burnIns.some((b) => isCard(b) && STAMP in b.params)
        ? [
            `${s.id}: a card's stamp is the cut list's; nothing is written for it`,
          ]
        : []
    ),
    ...(scenes.length > 0 && cut.stamp === undefined
      ? [
          `${scenes.map((s) => s.id).join(", ")}: a card is stamped with the commits it was checked against; the cut list has no stamp`,
        ]
      : []),
    ...(cut.burnIns.some(isCard)
      ? ["a card belongs to a scene, never to the whole video"]
      : []),
  ]
}
