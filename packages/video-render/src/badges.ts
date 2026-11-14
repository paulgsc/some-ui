/**
 * Which status badges a video showed before each scene (CARDS1, #2466):
 * what `@some-ui/burn-ins` needs to open each state's badge into its
 * definition at its first appearance in the video, and never again.
 *
 * Every badge a burn-in shows is a string under a key named `badge` in its
 * params (a status badge's own, a terminal card's line's, a cheat sheet's
 * row's, a flow's step's). The renderer reads them scene by scene,
 * in order, and gives each scene's burn-in that shows any the states shown
 * before it, as `badgesSeen`, so which appearance opens is a pure function
 * of the cut list. A state counts as seen only once its earliest appearance
 * in the scene has spelled itself out before the next scene starts: a
 * reveal starts after a status badge's lead, or at a card item's own time,
 * and runs `BADGE_TIMING.revealMs`. Otherwise the next appearance spells it
 * out again; a preview, which shortens scenes, is never refused for it.
 * Nothing is written for it by hand (`badgeProblems`).
 *
 * Promise BS1 (#2982): for every burn-in, every interleaving of its badges'
 * times with the scene's length, a state is in a later scene's `badgesSeen`
 * exactly when its reveal finished inside an earlier scene. Held by
 * `badges.test.ts`, which enumerates the interleavings, and by
 * `@some-ui/burn-ins`' `badge-timing.test.ts`, which checks `revealEnds`
 * against the cards' own frames.
 */

import type { BurnIn, CutList } from "./cut-list"

/** The param the renderer writes: the states shown earlier in the video. */
const BADGES_SEEN = "badgesSeen"

/**
 * The timing `@some-ui/burn-ins` draws badges with, which this package does
 * not import: burn-ins' contract may carry no implementation (AUDIENCES.md
 * A2), so `itemTimes` cannot cross, and burn-ins' tests already import this
 * package. A status badge appears after `STATUS_BADGE_LEAD_MS`; a card's
 * items after `ITEM.leadMs`, then one `ITEM.gapMs` after the one before
 * unless an item gives its own `atMs` (`itemTimes`); a badge spells itself
 * out over `REVEAL.totalMs`. Held equal by burn-ins' `badge-timing.test.ts`.
 */
export const BADGE_TIMING = {
  leadMs: 700,
  gapMs: 1150,
  revealMs: 2600,
} as const

/**
 * When each state's earliest badge in `params` finishes spelling itself out,
 * in ms into its scene: depth first, a `badge` key appears at its object's
 * time; an array's objects are items, each at its own `atMs` or one gap
 * after the item before.
 */
export function revealEnds(params: unknown): ReadonlyMap<string, number> {
  const ends = new Map<string, number>()
  const walk = (value: unknown, atMs: number): void => {
    if (Array.isArray(value)) {
      let before: number | undefined
      for (const item of value) {
        const given =
          typeof item === "object" && item !== null && "atMs" in item
            ? item.atMs
            : undefined
        const at =
          typeof given === "number"
            ? given
            : before === undefined
              ? BADGE_TIMING.leadMs
              : before + BADGE_TIMING.gapMs
        walk(item, at)
        before = at
      }
      return
    }
    if (typeof value !== "object" || value === null) return
    for (const [key, v] of Object.entries(value)) {
      if (key === "badge" && typeof v === "string") {
        const end = atMs + BADGE_TIMING.revealMs
        ends.set(v, Math.min(end, ends.get(v) ?? end))
      } else walk(v, atMs)
    }
  }
  walk(params, BADGE_TIMING.leadMs)
  return ends
}

/**
 * Each scene's burn-ins, with `badgesSeen` added to each that shows a
 * badge: the states whose reveal finished in the scenes before it, in the
 * order their reveals finished. `shownMs` is how long each scene's burn-ins
 * show: until the next scene starts, so less than its length when the next
 * one comes in over it.
 */
export function withBadgesSeen(
  shots: CutList["shots"],
  shownMs: ReadonlyArray<number>
): ReadonlyArray<ReadonlyArray<BurnIn>> {
  const seen = new Set<string>()
  return shots.map((s, i) => {
    const before = [...seen]
    const ends = s.burnIns.map((b) => revealEnds(b.params))
    const finished = ends
      .flatMap((e) => [...e])
      .filter(([, end]) => end <= (shownMs[i] ?? 0))
      .sort(([, a], [, b]) => a - b)
    for (const [state] of finished) seen.add(state)
    return s.burnIns.map((b, k) =>
      ends[k]?.size === 0
        ? b
        : { ...b, params: { ...b.params, [BADGES_SEEN]: before } }
    )
  })
}

/** A burn-in may not carry what the renderer writes, nor a badge over the whole video. */
export function badgeProblems(cut: CutList): Array<string> {
  const written = (b: BurnIn): boolean => BADGES_SEEN in b.params
  return [
    ...cut.shots.flatMap((s) =>
      s.burnIns.some(written)
        ? [
            `${s.id}: the badges shown earlier are worked out from the scenes; nothing is written for them`,
          ]
        : []
    ),
    ...(cut.burnIns.some((b) => written(b) || revealEnds(b.params).size > 0)
      ? ["a status badge belongs to a scene, never to the whole video"]
      : []),
  ]
}
