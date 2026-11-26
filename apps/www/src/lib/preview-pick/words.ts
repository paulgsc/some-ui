/**
 * Every word the preview card says (HOST16), in the person's terms: what
 * each preview shows, what using one does, where a pick is kept, and why
 * there is nothing to pick. Held by its test to no machinery.
 */
export const PICK_WORDS = {
  intro:
    "Each preview shows one way the videos could look. Use the one you like; you can change it later.",
  sample: "Sample: nothing you pick here is kept.",
  label: (about: string): string => `Which way: ${about}`,
  recommended: "Recommended",
  inIt: "What's in it",
  use: "Use this",
  own: "Something else: say what you want",
  none: "Nothing picked yet.",
  ownPrompt: "What would you like instead?",
  ownSend: "Ask for new previews",
  noClip: "The clip plays here once this phone has it.",
  /** On home's previews: a pick is an approval of a clip the owner watched. */
  watchFirst: "You can use this one once you've watched its clip here.",
  reading: "Reading home's previews.",
  again: "Try again",
  /** Home answered, and offers nothing to pick yet. */
  empty: "Home has no previews for you to pick yet.",
  unreadableConversations: (n: number): string =>
    n === 1
      ? "One conversation on home can't be read, so its previews aren't shown."
      : `${String(n)} conversations on home can't be read, so their previews aren't shown.`,
  unshown: (n: number): string =>
    n === 1
      ? "One preview can't be shown: its clips are gone from home."
      : `${String(n)} previews can't be shown: their clips are gone from home.`,
  /** Why home's previews aren't shown. */
  nothing: {
    unpaired:
      "Previews and picks are kept on home, and this phone isn't paired with home.",
    away: "Previews and picks are kept on home, and home can't be reached right now.",
    busy: "This phone was busy with home.",
    older: "This home keeps no previews yet.",
    unreadable: "This phone couldn't read home's previews.",
  },
  /** What a pick came to. */
  picked: {
    home: "Kept on home. Every video after it follows the one you chose.",
    sample: "Picked on the sample. Nothing here is kept.",
  },
  already: "That's the one you use already.",
  refused: "That pick wasn't kept: what home holds is shown again.",
  unreadable:
    "This phone couldn't tell whether home kept that pick: what home holds is shown again.",
  unpaired:
    "Picks are kept on home, and this phone isn't paired with home, so nothing was kept.",
  away: "Home didn't answer, so this phone can't say whether it kept that pick: what home holds is shown again once it answers.",
  busy: "This phone was busy with home, so nothing was kept. Try again.",
} as const
