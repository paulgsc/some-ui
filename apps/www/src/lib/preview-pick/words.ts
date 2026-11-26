/**
 * Every word the preview card says (HOST16), in the person's terms: what
 * each preview shows, what using one does, and where the pick is kept.
 * Held by its test to no machinery.
 */
export const PICK_WORDS = {
  intro:
    "Each preview shows one way the videos could look. Use the one you like, and every video after it follows it.",
  label: (about: string): string => `Which way: ${about}`,
  recommended: "Recommended",
  inIt: "What's in it",
  use: "Use this",
  own: "Something else: say what you want",
  none: "Until you pick, the recommended one stands.",
  ownPrompt: "What would you like instead?",
  ownSend: "Ask for new previews",
  noClip: "The clip plays here once home has made it.",
  kept: {
    phone: "Kept on this phone. Home doesn't take picks yet.",
    home: "Kept on home.",
  },
  already: "You already picked on this preview.",
  refused: "This phone couldn't keep your pick. Try again.",
} as const
