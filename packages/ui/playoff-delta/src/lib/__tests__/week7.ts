/**
 * A hand-made week shaped like 2026's week 7 for SF (the probe's numbers,
 * paulgsc/server#537): SF lost at ATL, the league then missed three of the
 * four pieces SF's loss woke, and SF has a bye next.
 */
import { SAMPLE_SEASON } from "@playoff-delta/lib/sample"
import type { StorySeason, StoryWeek, WayGame } from "@playoff-delta/lib/story"

const g = (
  away: string,
  home: string,
  kind: WayGame["kind"],
  want: string,
  winner: string,
  price: number
): WayGame => ({ home, away, kind, want, winner, price, error: 0.0005 })

/** In kickoff order. */
const GAMES: ReadonlyArray<WayGame> = [
  g("NE", "CHI", "exported", "NE", "CHI", 0.0012),
  g("PIT", "NO", "exported", "PIT", "PIT", 0.0005),
  g("NYG", "HOU", "exported", "HOU", "NYG", 0.0002),
  g("IND", "MIN", "exported", "IND", "MIN", 0.0003),
  g("SF", "ATL", "own", "SF", "ATL", 0.025),
  g("TB", "CAR", "inside", "TB", "TB", 0.0002),
  g("DEN", "ARI", "exported", "DEN", "DEN", 0.0013),
  g("LAR", "LV", "exported", "LV", "LAR", 0.0016),
  g("GB", "DET", "inside", "DET", "DET", 0.0002),
  g("KC", "SEA", "exported", "KC", "SEA", 0.0014),
  g("DAL", "PHI", "inside", "PHI", "DAL", 0.0003),
]

/** Given SF's loss: the four that woke are NE, DEN, LV and KC. */
const GIVEN = [
  0.0037, 0.001, 0.0016, 0.001, 0, 0.0005, 0.0071, 0.0057, 0.0004, 0.0092,
  0.0001,
]

const ROAD = [
  0.9926, 0.9914, 0.9914, 0.9911, 0.9907, 0.9615, 0.9615, 0.9615, 0.9533,
  0.9529, 0.9406, 0.9404,
]

const base = SAMPLE_SEASON.weeks[6]
if (!base) throw new Error("the bundled season has no week 7")

export const WEEK7: StoryWeek = {
  ...base,
  week: 7,
  game: { opponent: "ATL", won: false, relation: "conference" },
  share: { ...base.share, after: 0.9393 },
  clinched: false,
  paths: { ...base.paths, after: [5, 3, 1, 1, 1] },
  stake: { opponent: null, own: 0, spread: 0.02, exact: false, pieces: [] },
  ways: {
    games: [...GAMES],
    best: 0.9926,
    worst: 0.929,
    actual: 0.9404,
    rank: 0.06,
    given: {
      best: 0.9677,
      rank: 0.12,
      pieces: GAMES.map((game, i) => ({
        want: game.kind === "own" ? game.winner : game.want,
        price: GIVEN[i] ?? 0,
        error: game.kind === "own" ? 0 : 0.0005,
      })),
    },
    road: ROAD,
    mean: ROAD.map((r) => r - 0.02),
    strip: ROAD.map((_, i) => {
      const row = new Array<number>(20).fill(0)
      row[10] = 2 ** (GAMES.length - i)
      return row
    }),
    exact: false,
  },
  podium: {
    medals: [
      {
        team: "JAX",
        place: 1,
        rank: 0.95,
        best: 0.84,
        worst: 0.73,
        actual: 0.83,
        game: "bye",
        pieces: [],
      },
    ],
    place: 30,
    eligible: 31,
  },
}

export const SEASON7: StorySeason = {
  ...SAMPLE_SEASON,
  weeks: SAMPLE_SEASON.weeks.map((w) => (w.week === 7 ? WEEK7 : w)),
}
