/** `1 reflection`, `3 reflections`. */
export function counted(n: number): string {
  return `${n} reflection${n === 1 ? "" : "s"}`
}

/** What a reflection refused for want of a slot says. */
export const NO_ROOM = "No room for it: share or let some go first."
