/**
 * The categories of spoken card (C830, #3319): one list, with no imports,
 * which Studio's Spoken on the phone keeps a card under (and, with WALK7,
 * a cards essay's spoken scene maps to its template).
 * An `introduction` opens its essay (C814), before the intro. A `questions`
 * card sits anywhere, in the chapter of the scene before it, and opens no
 * chapter of its own (C831). Either may have Kokoro or the owner ask. A new
 * category is a new entry here, and its row says whether it opens the essay.
 */

/** Each category of spoken card. */
export const SPOKEN_CATEGORIES = ["introduction", "questions"] as const

export type SpokenCategory = (typeof SPOKEN_CATEGORIES)[number]

/** Each category as the owner reads it. */
export const SPOKEN_CATEGORY_TITLES: Readonly<Record<SpokenCategory, string>> =
  { introduction: "Introduction", questions: "Questions" }

/** Whether each category opens its essay, before the intro (C814, C831). */
export const SPOKEN_CATEGORY_OPENS: Readonly<Record<SpokenCategory, boolean>> =
  { introduction: true, questions: false }

/** Whether `value` names a category of spoken card. */
export const isSpokenCategory = (value: string): value is SpokenCategory =>
  SPOKEN_CATEGORIES.some((category) => category === value)
