/**
 * The webtoon's cast figures: the closed set of characters the renderer can
 * draw (docs/makjang/README.md, "The cast, drawn").
 *
 * Each figure is a small mascot, a Korean fruit or snack with one prop, drawn
 * at build time (`components/topik/handheld/cast-figure`). It is a costume,
 * not a role: a figure suggests what kind of part a character plays in a
 * drama, and the cast's own `standing` says who they are. A tree may name one
 * per character (makjang carries `figure` unread, as it carries `feeling`).
 * `figuresOf` gives every character one: the one named when the renderer has
 * it, else the first this cast leaves unused, in `FIGURE_KEYS` order, so a
 * tree that names none still draws its characters apart. A name outside the
 * vocabulary is a warning (`core/tree-audit`), never a rejection: a costume
 * has a smaller piece to drop than a scene's feeling.
 *
 * A figure is fixed per character for the whole lesson: the same drawing on
 * every line, whatever the scene's feeling or the choice, so it says who is
 * speaking and nothing about a candidate (canon Remark 9.3).
 */

import type { Character, CharacterId } from "@some-ui/makjang"

export const FIGURE_KEYS = [
  "heart",
  "heir",
  "elder",
  "rival",
  "aide",
  "friend",
  "kid",
  "stranger",
] as const

export type FigureKey = (typeof FIGURE_KEYS)[number]

export const isFigureKey = (value: unknown): value is FigureKey =>
  FIGURE_KEYS.some((key) => key === value)

export type FigureWords = {
  /** What it is drawn as, in Korean. */
  name: string
  /** The kind of part it suits, in English, for the tree prompt's author. */
  suits: string
}

export const FIGURE_WORDS: Readonly<Record<FigureKey, FigureWords>> = {
  heart: {
    name: "복숭아",
    suits: "a peach with rosy cheeks: the earnest lead, the one who loves",
  },
  heir: {
    name: "배",
    suits: "a pear in a little crown: the heir, the privileged one, the boss",
  },
  elder: {
    name: "감",
    suits:
      "a persimmon in spectacles: the elder, a parent, the chairman, a teacher",
  },
  rival: {
    name: "고추",
    suits: "a chili pepper with sharp brows: the rival, the schemer",
  },
  aide: {
    name: "삼각김밥",
    suits:
      "a rice triangle in a suit and glasses: the secretary, the loyal aide, staff",
  },
  friend: {
    name: "귤",
    suits: "a tangerine with a beaming smile: the friend, a sibling, the ally",
  },
  kid: {
    name: "딸기",
    suits: "a wide-eyed strawberry: the youngest, a child, the newcomer",
  },
  stranger: {
    name: "밤",
    suits:
      "a chestnut under a low hat: the stranger, a secret keeper, the unknown",
  },
}

/**
 * Every character's figure: the one the tree names when the renderer has
 * it, else the first this cast leaves unused (and once all are used, the
 * vocabulary again from the top). Two characters a tree names alike keep it.
 */
export function figuresOf(
  cast: ReadonlyArray<Pick<Character, "id" | "figure">>
): ReadonlyMap<CharacterId, FigureKey> {
  const named = new Map<CharacterId, FigureKey>()
  for (const { id, figure } of cast) {
    if (isFigureKey(figure)) named.set(id, figure)
  }
  const taken = new Set(named.values())
  const spare = FIGURE_KEYS.filter((key) => !taken.has(key))
  let unnamed = 0
  const figures = new Map<CharacterId, FigureKey>()
  for (const { id } of cast) {
    const own = named.get(id)
    if (own !== undefined) {
      figures.set(id, own)
      continue
    }
    const index = unnamed++
    const figure =
      spare[index] ??
      FIGURE_KEYS[(index - spare.length) % FIGURE_KEYS.length] ??
      "heart"
    figures.set(id, figure)
  }
  return figures
}
