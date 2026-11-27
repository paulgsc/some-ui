/**
 * The shop as the capture build shows it (KP4): a sample that asks no home
 * and keeps nothing. A hunch about a phone, the rain or being okay finds the
 * shelf's phrase for it; anything else is answered as a miss home kept, as
 * the Android app would say it. The provenance strip says it is sample data.
 */
import type { Lookup, ShopPort } from "@some-ui/topik"

/** Words a sample hunch may hold, and the shelf's phrase each finds. */
const SAMPLE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bphone\b/i, "ph.where-is-my-phone"],
  [/\brain/i, "ph.rained-so-stayed-home"],
  [/\b(okay|ok|fine)\b/i, "ph.its-okay"],
]

export function sampleLookup(words: string): Lookup {
  const phrases = SAMPLE.filter(([said]) => said.test(words)).map(
    ([, phrase]) => phrase
  )
  return phrases.length > 0 ? { kind: "hit", phrases } : { kind: "kept" }
}

export const sampleShop: ShopPort = {
  lookUp: (words) => Promise.resolve(sampleLookup(words)),
  // Asks no home, so nothing goes unanswered, and nothing is kept.
  keep: () => false,
  hear: () => Promise.reject(new Error("a spoken hunch isn't offered")),
}
