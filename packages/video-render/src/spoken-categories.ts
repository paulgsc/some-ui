/**
 * The categories of spoken card (C830, #3319): one list, with no imports,
 * which Studio's Spoken on the phone keeps a card under (and, with WALK7,
 * a cards essay's spoken scene maps to its template).
 * Today only `introduction`, where Kokoro asks and the owner's take answers,
 * each speaker lit while they speak. A new category is a new entry here.
 */

/** Each category of spoken card. */
export const SPOKEN_CATEGORIES = ["introduction"] as const

export type SpokenCategory = (typeof SPOKEN_CATEGORIES)[number]

/** Each category as the owner reads it. */
export const SPOKEN_CATEGORY_TITLES: Readonly<Record<SpokenCategory, string>> =
  { introduction: "Introduction" }

/** Whether `value` names a category of spoken card. */
export const isSpokenCategory = (value: string): value is SpokenCategory =>
  SPOKEN_CATEGORIES.some((category) => category === value)
