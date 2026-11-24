/**
 * A pool's draw (#3473, C1440): which of an episode's snacks a visit shows,
 * by their places in the pool, in the order shown. The shuffle is the
 * repo's one seeded Fisher-Yates (`shuffledBySeed`); the landing's script
 * seeds it fresh each visit, a test with a fixed seed. Each episode's pool
 * takes its own seed from the visit's, so two pools never draw in step.
 */
import { fnv1a, shuffledBySeed } from "@some-ui/core-utils"

export function drawSnacks(
  episode: string,
  size: number,
  draw: number,
  seed: number
): ReadonlyArray<number> {
  return shuffledBySeed(
    Array.from({ length: size }, (_, i) => i),
    (seed ^ fnv1a(episode)) >>> 0
  ).slice(0, draw)
}
