/**
 * A spoken card's take, as its line names it (W5, C807): `spoken:<card>.<n>`,
 * part `n` (from 0) of card `card`. Studio's Spoken writes it when a part is
 * recorded (www's `lib/studio-spoken`); Takes reads it (`@some-ui/soundbites`) to put the take in the Spoken card compartment,
 * by its card (#3339), and Needs your attention to lead back to the part.
 * One line split on `:` into two parts, so home keeps it as a take with no
 * scene (paulgsc/server `voice/src/about.rs`, `studio`), never a scene's
 * (three parts) nor an idea's answer (`idea:`). Pure.
 */

/** The line a take of part `n` (from 0) of spoken card `card` answers. */
export const spokenLineOf = (card: string, n: number): string =>
  `spoken:${card}.${n}`

/** The spoken card and part (from 0) a take's line names; null for any other line. */
export function spokenPartOfLine(
  line: string
): { readonly card: string; readonly part: number } | null {
  const named = /^spoken:([a-z0-9-]{1,64})\.(\d{1,3})$/u.exec(line)
  const [, card, part] = named ?? []
  if (card === undefined || part === undefined) return null
  return { card, part: Number(part) }
}
