/** A value, or every reason there isn't one. */
export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: ReadonlyArray<string> }

/** Whether `value` is one of `options`. */
export const isOneOf = <T extends string>(
  options: ReadonlyArray<T>,
  value: unknown
): value is T => options.some((o) => o === value)
