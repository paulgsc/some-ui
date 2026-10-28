/**
 * A search param as a whole number of zero or more, from the URL's string or
 * a number the router already parsed; anything else is `undefined`, so a
 * route drops it rather than pass it on.
 */
export const wholeNumber = (value: unknown): number | undefined => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}
