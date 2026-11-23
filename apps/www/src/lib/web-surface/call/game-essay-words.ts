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
  quarter: (period: number): string => (period > 4 ? "OT" : `Q${period}`),
  /** Down and distance: "4th & 5", or "1st & Goal" when the line to gain is the goal line. */
  downs: (down: number, distance: number, goal: boolean): string =>
    `${["1st", "2nd", "3rd", "4th"][down - 1] ?? ""} & ${goal ? "Goal" : String(distance)}`,
  /** A game, its visitors first: "NE at CHI". */
  game: (away: string, home: string): string => `${away} at ${home}`,
  /** Who has the ball, and where. */
  ball: (team: string, where: string): string => `${team} at ${where}`,
  /** When an unmatched bite was said, on the owner's clock (D12's stamp). */
  saidAt: (clock: string): string => `Said at ${clock}`,
  at: (side: string, yard: number): string =>
    yard === 50 ? "the 50" : `the ${side} ${yard}`,
  stance: {
    decision: "The decision",
    umbrage: "Umbrage",
    nerves: "Nerves",
    celebration: "Celebration",
    injury: "The injury",
  },
} as const
