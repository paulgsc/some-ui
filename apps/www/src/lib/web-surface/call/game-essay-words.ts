/**
 * Every word the Game Week essay's stage shows besides the essay's own data
 * and the format's scene names, in one table; the words every essay says
 * are `./essay-words`'.
 */
export const GAME_ESSAY_WORDS = {
  title: "Game Week",
  /** A bite in the owner's own voice. */
  yourVoice: "You · your voice",
  /** A bite the second voice reads (D6). */
  readAloud: "Your words · read aloud",
  /** A bite said first and never mapped. */
  saidFirst: "Said first",
  /** A bite home matched to no play: its stamp and scenario, no field (D12). */
  noPlay: "No play matched",
  halftime: "Halftime",
  quarter: (period: number): string => (period > 4 ? "OT" : `Q${period}`),
  downs: (down: number, distance: number): string =>
    `${["1st", "2nd", "3rd", "4th"][down - 1] ?? ""} & ${distance}`,
  at: (side: string, yard: number): string =>
    yard === 50 ? "the 50" : `the ${side} ${yard}`,
  /** How the game ended for the team it is read for. */
  final: "Final",
  stance: {
    decision: "The decision",
    umbrage: "Umbrage",
    nerves: "Nerves",
    celebration: "Celebration",
    injury: "The injury",
  },
} as const
