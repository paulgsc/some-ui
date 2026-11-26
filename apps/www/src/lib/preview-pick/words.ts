/**
 * Every word the preview card says (HOST16), in the person's terms: what
 * each preview shows, what using one does, and where the pick is kept.
 * Held by its test to no machinery.
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
  noClip: "The clip plays here once home has made it.",
  kept: {
    phone:
      "Kept on this phone. Once home takes picks, every video after it follows the one you chose.",
    home: "Kept on home. Every video after it follows the one you chose.",
    sample: "Picked on the sample. Nothing here is kept.",
  },
  already: "That's the one you use already.",
  refused: "This phone couldn't keep your pick. Try again.",
} as const
