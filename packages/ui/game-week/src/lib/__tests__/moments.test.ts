/**
 * A game's moment log (GWB14 D15), as home's `GET /games/:id/moments`
 * answers it (paulgsc/server `handlers/games.rs`; its sample entry is the
 * big play below).
 */
import {
  BIG_MOMENTS,
  isBigMoment,
  momentsWithNoBite,
  readMoments,
} from "@game-week/lib/moments"
import { MOMENTS, SCENARIOS } from "@some-ui/game-scenarios"
import { describe, expect, it } from "vitest"

const LOG = {
  gameId: "401873010",
  engineVersion: 7,
  catalogVersion: 2,
  final: true,
  moments: [
    {
      at: "2026-10-23T00:31:10Z",
      id: "in.third-long",
      line: "NE 3rd and 9 at the NE 31",
      playId: "401873010101",
      unit: "offense",
      unitSide: "NE",
      period: 1,
      clock: "11:02",
    },
    {
      at: "2026-10-23T01:51:02Z",
      bigPlay: {
        by: "CHI",
        good: false,
        kind: "interception-return",
        scored: true,
        size: "huge",
        yards: 45,
      },
      id: "in.big-play",
      line: "CHI 45-yard interception return, touchdown",
      playId: "4018730101210",
      unit: "defense",
      unitSide: "CHI",
      period: 3,
      clock: "4:12",
    },
    {
      at: "2026-10-23T01:51:02Z",
      id: "in.turnover",
      line: "NE intercepted at the CHI 45",
      playId: "4018730101210",
      unit: "offense",
      unitSide: "NE",
      period: 3,
      clock: "4:12",
    },
    {
      at: "2026-10-23T01:52:20Z",
      id: "in.some-newer-scenario",
      line: "A scenario a newer catalog has",
      playId: "4018730101234",
      unit: null,
      unitSide: null,
      period: 3,
      clock: "3:40",
    },
    {
      at: "2026-10-23T02:20:00Z",
      id: "in.two-point",
      line: "NE try after the touchdown",
      playId: "4018730101500",
      unit: "offense",
      unitSide: "NE",
      period: 4,
      clock: "2:01",
    },
  ],
}

describe("a game's moments, read", () => {
  it("reads each moment in game order, leaving out scenarios this build lacks", () => {
    const read = readMoments(LOG)
    expect(read?.final).toBe(true)
    expect(read?.moments.map((moment) => moment.scenario)).toEqual([
      "in.third-long",
      "in.big-play",
      "in.turnover",
      "in.two-point",
    ])
    expect(read?.moments[1]).toMatchObject({
      context: "CHI 45-yard interception return, touchdown",
      playId: "4018730101210",
      period: 3,
      clock: "4:12",
      unit: { unit: "defense", side: "CHI" },
    })
  })

  it("reads a moment home has no quarter or clock for", () => {
    const [first] = LOG.moments
    expect(
      readMoments({
        ...LOG,
        moments: [{ ...first, period: null, clock: null }],
      })?.moments[0]
    ).toMatchObject({ period: null, clock: null })
  })

  it("reads nothing it can't place in the game", () => {
    const [first] = LOG.moments
    for (const broken of [
      { ...first, period: 0 },
      { ...first, period: "1" },
      { ...first, clock: 4 },
      { ...first, playId: 7 },
      { ...first, at: undefined },
    ]) {
      expect(readMoments({ ...LOG, moments: [broken] })).toBeNull()
    }
    expect(readMoments({ ...LOG, final: "yes" })).toBeNull()
    expect(readMoments(null)).toBeNull()
  })
})

describe("the big moments with no bite (D15)", () => {
  it("counts scores, turnovers, big plays and onside kicks as big, and decides every moment", () => {
    expect(Object.keys(BIG_MOMENTS).sort()).toEqual([...MOMENTS].sort())
    const big = SCENARIOS.filter((scenario) => isBigMoment(scenario.id)).map(
      (scenario) => scenario.id
    )
    expect(big.sort()).toEqual([
      "in.big-play",
      "in.fell-behind",
      "in.onside-kick",
      "in.turnover",
      "in.two-point",
    ])
  })

  it("leaves out every moment of a play a bite was matched to", () => {
    const read = readMoments(LOG)
    const moments = read?.moments ?? []
    expect(
      momentsWithNoBite(moments, new Set()).map((moment) => moment.scenario)
    ).toEqual(["in.big-play", "in.turnover", "in.two-point"])
    expect(
      momentsWithNoBite(moments, new Set(["4018730101210"])).map(
        (moment) => moment.scenario
      )
    ).toEqual(["in.two-point"])
  })
})
