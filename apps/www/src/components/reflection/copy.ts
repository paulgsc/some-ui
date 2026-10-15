/** `1 reflection`, `3 reflections`, `2 soundbites`. */
export function counted(n: number, noun = "reflection"): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

/**
 * What the whole export's hand-off lets go, as "2 reflections and 1
 * soundbite"; empty when nothing went out that the phone would let go.
 */
export function goingOut(reflections: number, soundbites: number): string {
  return [
    reflections > 0 ? counted(reflections) : null,
    soundbites > 0 ? counted(soundbites, "soundbite") : null,
  ]
    .filter((part) => part !== null)
    .join(" and ")
}

/** What a reflection refused for want of a slot says. */
export const NO_ROOM = "No room for it: share or let some go first."
