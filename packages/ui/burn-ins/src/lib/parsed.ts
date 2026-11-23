/** A value, or every reason there isn't one. */
export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/** Whether `value` is one of `options`. */
export const isOneOf = <T extends string>(
  options: ReadonlyArray<T>,
  value: unknown
): value is T => options.some((o) => o === value)

/**
 * Whether `problem` says a burn-in doesn't fit its frame: every kind words
 * a layout refusal so (`row 4 doesn't fit`, `5 rows don't fit`). Drawing is
 * the params, the frame and the fonts alone, so a burn-in refused so is
 * refused the same way every time it is drawn (CHEAT).
 */
export const isFitProblem = (problem: string): boolean =>
  /\b(?:doesn't|don't) fit\b/.test(problem)
