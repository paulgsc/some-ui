/**
 * Assembly: what an answer built from tiles on a touch screen needs.
 *
 * Typing Korean on a phone measures the learner's IME more than their
 * comprehension (adaptive-learning canon Prop. 9.4), so a build probe's answer
 * is meant to be *built* from tiles instead (Def. 4.5). Here is what the
 * probe audit holds a build probe to - that its answer can be tiled at all,
 * and that its excerpt does not show it - and the seeded shuffle the drama's
 * options and the read-aloud sets are ordered by.
 */

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/
const PUNCTUATION = /[.,!?;:"'“”‘’()[\]…~。、]/g

/** Boards larger than this stop fitting a phone's thumb zone. */
export const MAX_TILES = 8

const stripPunctuation = (text: string): string => text.replace(PUNCTUATION, "")

/** An answer as compared: punctuation, case and spacing aside. */
const normalizeAnswer = (text: string): string =>
  stripPunctuation(text).toLowerCase().replace(/\s+/g, "")

/**
 * Split an answer into tiles: space-delimited words (어절) when there are
 * several, Hangul syllables when there is one Hangul word. A single non-Hangul
 * word has no useful pieces - building "hello" letter by letter tests spelling,
 * not comprehension - so it yields null and the caller falls back.
 */
export function tokenize(
  answer: string
): { tokens: Array<string>; joiner: "" | " " } | null {
  const words = stripPunctuation(answer).trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return { tokens: words, joiner: " " }
  const [word] = words
  if (word === undefined || !HANGUL.test(word)) return null
  const syllables = Array.from(word)
  return syllables.length >= 2 ? { tokens: syllables, joiner: "" } : null
}

/** FNV-1a: a small, stable string hash for seeding. */
function hashSeed(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32 */
function random(seed: number): () => number {
  let state = seed
  return (): number => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: Array<T>, next: () => number): Array<T> {
  // Decorate-sort-undecorate: a shuffle with no index juggling to type.
  return items
    .map((item) => ({ item, key: next() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item)
}

/** A deterministic shuffle: the same key always yields the same order. */
export function seededShuffle<T>(items: Array<T>, seedKey: string): Array<T> {
  return shuffle(items, random(hashSeed(seedKey)))
}

/**
 * Whether showing `excerpt` would show the answer.
 *
 * An item's Korean excerpt is often the very phrase it asks for. Put
 * above a tile board, it turns assembly into copying: the answer is on screen,
 * so the outcome says nothing about the learner (canon Prop. 3.1).
 */
export function excerptRevealsAnswer(
  excerpt: string,
  accepted: Array<string>
): boolean {
  const seen = normalizeAnswer(excerpt)
  if (seen.length === 0) return false
  return accepted.some((answer) => {
    const target = normalizeAnswer(answer)
    return target.length > 0 && seen.includes(target)
  })
}
