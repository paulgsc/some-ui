/**
 * Which status badges a video showed before each scene (CARDS1, #2466):
 * what `@some-ui/burn-ins` needs to open each state's badge into its
 * definition at its first appearance in the video, and never again.
 *
 * Every badge a burn-in shows is a string under a key named `badge` in its
 * params (a status badge's own, a terminal card's line's, a cheat sheet's
 * row's), in the order they appear. The renderer reads them scene by scene,
 * in order, and gives each scene's burn-in that shows any the states shown
 * before it, as `badgesSeen`, so which appearance opens is a pure function
 * of the cut list. A scene too short for a badge to finish spelling itself
 * out leaves its state unseen, so the next appearance spells it out again;
 * a preview, which shortens scenes, is never refused for it. Nothing is
 * written for it by hand (`badgeProblems`).
 */

import type { BurnIn, CutList } from "./cut-list"

/** The param the renderer writes: the states shown earlier in the video. */
const BADGES_SEEN = "badgesSeen"

/**
 * How long a scene lasts that a badge finishes spelling itself out in: a
 * status badge's lead and its reveal (`@some-ui/burn-ins`'
 * `STATUS_BADGE_LEAD_MS` and `REVEAL`, 0.7 s and 2.6 s).
 */
const REVEAL_SCENE_MS = 3300

/** Every badge in `value`, depth first, in the order its arrays list them. */
function badgesIn(value: unknown): ReadonlyArray<string> {
  if (Array.isArray(value)) return value.flatMap(badgesIn)
  if (typeof value !== "object" || value === null) return []
  return Object.entries(value).flatMap(([key, v]) =>
    key === "badge" && typeof v === "string" ? [v] : badgesIn(v)
  )
}

/**
 * Each scene's burn-ins, with `badgesSeen` added to each that shows a
 * badge: the states the scenes before it showed long enough to spell out.
 */
export function withBadgesSeen(
  shots: CutList["shots"]
): ReadonlyArray<ReadonlyArray<BurnIn>> {
  const seen = new Set<string>()
  return shots.map((s) => {
    const before = [...seen]
    const burnIns = s.burnIns.map((b) => {
      const shown = badgesIn(b.params)
      if (shown.length === 0) return b
      if (s.durationMs >= REVEAL_SCENE_MS)
        for (const state of shown) seen.add(state)
      return { ...b, params: { ...b.params, [BADGES_SEEN]: before } }
    })
    return burnIns
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
    ...(cut.burnIns.some((b) => written(b) || badgesIn(b.params).length > 0)
      ? ["a status badge belongs to a scene, never to the whole video"]
      : []),
  ]
}
