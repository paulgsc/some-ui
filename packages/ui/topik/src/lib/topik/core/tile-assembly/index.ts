/**
 * Assembly: an answer built from tiles on a touch screen.
 *
 * Typing Korean on a phone measures the learner's IME more than their
 * comprehension (adaptive-learning canon Prop. 9.4), so the handheld surface
 * asks for the answer to be *built* from tiles instead (Def. 4.5) - today, the
 * utterance a build probe asks for (Def. 4.6): the negation, the past tense. The tiles
 * disclose the answer's pieces and withhold their order, which is why the
 * outcome is recorded as `assembly` and never as free text (Rem. 4.6).
 *
 * Everything here is deterministic: the shuffle and distractor choice are
 * seeded by a key the caller supplies, so a re-render, a remount or a resumed
 * lesson shows the same board. The board is presentation, not pedagogical
 * state (canon Prop. 9.2) - it can always be rebuilt from the item.
 */

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/
const PUNCTUATION = /[.,!?;:"'“”‘’()[\]…~。、]/g

/** Boards larger than this stop fitting a phone's thumb zone. */
export const MAX_TILES = 8

export type TileBoard = {
  /** The answer, in order. */
  target: Array<string>
  /** Everything on the board - target plus distractors - shuffled. */
  tiles: Array<string>
  /** How placed tiles join into an answer: syllables abut, words are spaced. */
  joiner: "" | " "
}

const stripPunctuation = (text: string): string => text.replace(PUNCTUATION, "")

export function normalizeAnswer(text: string, joiner: "" | " "): string {
  const stripped = stripPunctuation(text).toLowerCase().trim()
  return joiner === ""
    ? stripped.replace(/\s+/g, "")
    : stripped.replace(/\s+/g, " ")
}

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
export function hashSeed(key: string): number {
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
 * Tiles for an answer, or null when it cannot be tiled.
 *
 * Distractors are the item's authored foils first, then pieces of `pool` (text
 * from the same conversation, so they are plausible) in the answer's own
 * granularity and script. None duplicates a target tile - a duplicate would
 * make two different boards grade the same. Null is returned for an answer
 * with nothing to tile or one too long for a phone; a build probe that gets
 * null is left out of the lesson rather than asked some other way.
 */
export function buildTileBoard(
  /** Accepted forms of the answer; the first is the one tiled. */
  accepted: Array<string>,
  seedKey: string,
  pool: Array<string>,
  {
    distractors: authored = [],
    distractorCount = 2,
  }: {
    /** Plausible wrong pieces authored with the item; preferred over `pool`. */
    distractors?: Array<string>
    distractorCount?: number
  } = {}
): TileBoard | null {
  const [answer] = accepted
  if (answer === undefined) return null
  const split = tokenize(answer)
  if (!split || split.tokens.length > MAX_TILES) return null

  const { tokens, joiner } = split
  const next = random(hashSeed(seedKey))
  const hangul = HANGUL.test(answer)
  const taken = new Set(tokens)

  const candidates = new Set<string>()
  for (const text of pool) {
    const pieces =
      joiner === ""
        ? Array.from(stripPunctuation(text).replace(/\s+/g, ""))
        : stripPunctuation(text).split(/\s+/)
    for (const piece of pieces) {
      if (piece && !taken.has(piece) && HANGUL.test(piece) === hangul) {
        candidates.add(piece)
      }
    }
  }

  const room = Math.max(0, Math.min(distractorCount, MAX_TILES - tokens.length))
  // Authored foils first (못 for 안, 할게요 for 했어요 - the confusions worth
  // provoking), then pieces of the conversation to fill the room.
  const foils = [
    ...new Set(
      authored
        .map((foil) => stripPunctuation(foil).trim())
        .filter((foil) => foil !== "" && !taken.has(foil))
    ),
  ]
  const filler = shuffle(
    [...candidates].filter((piece) => !foils.includes(piece)).sort(),
    next
  )
  const distractors = [...foils, ...filler].slice(0, room)
  let tiles = shuffle([...tokens, ...distractors], next)

  // A board that happens to shuffle into the answer asks nothing.
  const [head, ...rest] = tiles
  if (
    head !== undefined &&
    rest.length > 0 &&
    tiles.join(joiner) === tokens.join(joiner)
  ) {
    tiles = [...rest, head]
  }

  return { target: tokens, tiles, joiner }
}

/**
 * Whether showing `excerpt` would show the answer.
 *
 * An item's Korean excerpt is often the very phrase it asks for. Put
 * above a tile board, it turns assembly into copying: the answer is on screen,
 * so the outcome says nothing about the learner (canon Prop. 3.1). The
 * handheld check hides such an excerpt; the line itself is still a tap away.
 */
export function excerptRevealsAnswer(
  excerpt: string,
  accepted: Array<string>
): boolean {
  const seen = normalizeAnswer(excerpt, "")
  if (seen.length === 0) return false
  return accepted.some((answer) => {
    const target = normalizeAnswer(answer, "")
    return target.length > 0 && seen.includes(target)
  })
}

/** Grade placed tiles against every accepted form of the answer. */
export function gradeAssembly(
  placed: Array<string>,
  accepted: Array<string>,
  joiner: "" | " "
): boolean {
  const built = normalizeAnswer(placed.join(joiner), joiner)
  if (built.length === 0) return false
  return accepted.some((answer) => normalizeAnswer(answer, joiner) === built)
}
