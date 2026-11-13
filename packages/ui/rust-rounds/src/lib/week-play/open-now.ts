/**
 * Which week the phone plays at a time (RR13): the newest of those held that
 * has opened, or, before any has, the one that opens first. A week can be
 * answered before it opens: it closes at its deadline only. Imports nothing,
 * so the Practice Home card's light read (`src/entry.ts`) and the week's
 * screen (`./runtime`) pick by the one rule.
 */
export function weekOpenNow<T>(
  weeks: ReadonlyArray<T>,
  opensOf: (week: T) => string,
  at: number
): T | null {
  const opens = (week: T): number => Date.parse(opensOf(week))
  const opened = weeks
    .filter((week) => opens(week) <= at)
    .sort((a, b) => opens(b) - opens(a))
  const first = [...weeks].sort((a, b) => opens(a) - opens(b))[0]
  return opened[0] ?? first ?? null
}
