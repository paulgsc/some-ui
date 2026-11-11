/**
 * A week's id and its number, apart from the week's schema (`./week`) so a
 * light reader (Practice Home's card, Studio's essay names) loads no schema.
 */

/** A week's id: its ISO year and week, like `2026-w46`. One week per id, never reused. */
export const WEEK_ID = /^\d{4}-w(?:0[1-9]|[1-4]\d|5[0-3])$/

/** A week's number, as the owner knows it: `2026-w46` is week 46. */
export const weekNumber = (id: string): number => Number(id.slice(6))
