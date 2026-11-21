/**
 * The NFL's 32 teams as ESPN abbreviates them, in order: the teams home can
 * follow live (`game-teams`, #3329). Home takes 2 to 4 capitals each, at
 * most 32, and keeps them sorted and each once.
 */
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

/** Whether `chosen` differs from what home follows, as home keeps a list. */
export function teamsChanged(
  chosen: ReadonlyArray<string>,
  held: ReadonlyArray<string>
): boolean {
  const kept = [...new Set(chosen)].sort()
  const home = [...new Set(held)].sort()
  return kept.length !== home.length || kept.some((team, i) => team !== home[i])
}
