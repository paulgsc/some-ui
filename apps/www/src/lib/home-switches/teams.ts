/** The NFL's 32 teams as ESPN abbreviates them, in order (#3329). */
export const NFL_TEAMS = [
  "ARI",
  "ATL",
  "BAL",
  "BUF",
  "CAR",
  "CHI",
  "CIN",
  "CLE",
  "DAL",
  "DEN",
  "DET",
  "GB",
  "HOU",
  "IND",
  "JAX",
  "KC",
  "LAC",
  "LAR",
  "LV",
  "MIA",
  "MIN",
  "NE",
  "NO",
  "NYG",
  "NYJ",
  "PHI",
  "PIT",
  "SEA",
  "SF",
  "TB",
  "TEN",
  "WSH",
] as const

/** The most teams home follows at once. */
export const TEAMS_MOST = 32

/**
 * The chips to show: every team home can follow, then any team home holds
 * that the list lacks (set elsewhere, or renamed since), so each can still be
 * taken off.
 */
export function teamChips(
  held: ReadonlyArray<string> | null
): ReadonlyArray<string> {
  const known: ReadonlyArray<string> = NFL_TEAMS
  return [...known, ...(held ?? []).filter((team) => !known.includes(team))]
}

/** `teams` with `team` taken off when it is there, or added in order. */
export function toggledTeam(
  teams: ReadonlyArray<string>,
  team: string
): ReadonlyArray<string> {
  return teams.includes(team)
    ? teams.filter((each) => each !== team)
    : [...teams, team].sort()
}

/** Whether `chosen` differs from `held`, each sorted and each once. */
export function teamsChanged(
  chosen: ReadonlyArray<string>,
  held: ReadonlyArray<string>
): boolean {
  return (
    chosen.length !== held.length || chosen.some((team, i) => team !== held[i])
  )
}
