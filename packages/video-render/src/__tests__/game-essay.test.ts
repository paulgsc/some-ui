/**
 * The Game Week essay (GWB, #2074): its format is one, refusing a newer
 * version; the sample parses; section 0's rules hold (a half or game with no
 * bite is refused, a bite has at most one still, a stance outside the set
 * is refused, and a line Kokoro says quoting a play's text is refused, a
 * bite read aloud included, while one in the owner's own voice is not); and an essay that contradicts itself is
 * refused with every reason.
 */
import { parseFormat } from "@video-render/format"
import {
  GAME_ESSAY_ID,
  GAME_ESSAY_VERSION,
  gameEssayFormat,
  gamePlaceOf,
  gameVoiceOf,
  parseGameEssay,
  QUOTE_RUN,
  READ_ALOUD_BELOW,
  sampleGameEssay,
  STANCES,
  weekDaysOf,
} from "@video-render/game-essay"
import type { GameEssay } from "@video-render/game-essay"
import { describe, expect, it } from "vitest"

function sample(): GameEssay {
  const parsed = sampleGameEssay()
  if (!parsed.ok) throw new Error(parsed.problems.join("; "))
  return parsed.value
}

const problems = (raw: unknown): ReadonlyArray<string> => {
  const parsed = parseGameEssay(raw)
  return parsed.ok ? [] : parsed.problems
}

/** The sample with its first game's first bite changed. */
function withFirstBite(change: Readonly<Record<string, unknown>>): unknown {
  const essay = sample()
  const [game] = essay.games
  if (game === undefined) throw new Error("the sample has a game")
  const [half, ...halves] = game.halves
  if (half === undefined) throw new Error("the sample has a half")
  const [bite, ...bites] = half.bites
  if (bite === undefined) throw new Error("the sample has a bite")
  return {
    ...essay,
    games: [
      {
        ...game,
        halves: [
          { ...half, bites: [{ ...bite, ...change }, ...bites] },
          ...halves,
        ],
      },
      ...essay.games.slice(1),
    ],
  }
}

describe("the game essay's format", () => {
  it("is a format, and refuses a version newer than the newest (VS1)", () => {
    expect(parseFormat(gameEssayFormat()).ok).toBe(true)
    expect(() => gameEssayFormat(GAME_ESSAY_VERSION + 1)).toThrow()
  })

  it("has the open, a game, its bites, halftime and the close, in that order", () => {
    expect(gameEssayFormat().scenes.map((scene) => scene.id)).toEqual([
      "open",
      "game",
      "bite",
      "halftime",
      "close",
    ])
  })

  it("refuses an essay for a newer template (VS1)", () => {
    expect(
      problems({
        ...sample(),
        template: { id: GAME_ESSAY_ID, version: GAME_ESSAY_VERSION + 1 },
      }).join("\n")
    ).toMatch(/newer than this build knows/)
  })
})

describe("the sample", () => {
  it("parses, with a bite in each half and one matched to no play", () => {
    const essay = sample()
    const bites = essay.games.flatMap((game) =>
      game.halves.flatMap((half) => half.bites)
    )
    expect(bites.length).toBe(3)
    expect(bites.some((bite) => bite.play === null)).toBe(true)
    expect(new Set(bites.map((bite) => bite.voice))).toEqual(
      new Set(["owner", "read-aloud"])
    )
  })
})

describe("section 0: what the essay never is (D20)", () => {
  it("refuses a half with no bite, and a game with no half (every scene stands on a bite)", () => {
    const essay = sample()
    const [game] = essay.games
    if (game === undefined) throw new Error("the sample has a game")
    const noHalftime = { ...game, halftime: undefined }
    expect(
      problems({
        ...essay,
        games: [{ ...noHalftime, halves: [{ half: "first", bites: [] }] }],
      })
    ).toEqual([expect.stringMatching(/^games\.0\.halves\.0\.bites: Too small/)])
    expect(
      problems({ ...essay, games: [{ ...noHalftime, halves: [] }] })
    ).toEqual([expect.stringMatching(/^games\.0\.halves: Too small/)])
  })

  it("refuses a second still on a bite, or a sequence of plays (one still per bite)", () => {
    const [bite] = sample().games[0]?.halves[0]?.bites ?? []
    if (bite?.play == null)
      throw new Error("the sample's first bite is matched")
    expect(
      problems(withFirstBite({ plays: [bite.play, bite.play] }))
    ).not.toEqual([])
    expect(
      problems(
        withFirstBite({
          play: { ...bite.play, still: [bite.play.still] },
        })
      )
    ).not.toEqual([])
  })

  it("holds a bite to one stance of the fixed set (a fixed editorial shape)", () => {
    for (const stance of STANCES)
      expect(problems(withFirstBite({ stance }))).toEqual([])
    expect(problems(withFirstBite({ stance: "hot-take" }))).toEqual([
      expect.stringMatching(/stance/),
    ])
  })

  it(`refuses a line Kokoro says that repeats ${QUOTE_RUN} words of a play's text in a row (our words, never theirs)`, () => {
    const quoting = withFirstBite({
      answer: {
        said: "As they had it: pass short middle intended for the tight end.",
      },
    })
    const found = problems(quoting)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatch(/the host's answer: .*section 0/)
  })

  it("refuses a quote of another bite's play too, case and punctuation aside", () => {
    const quoting = withFirstBite({
      setup: { said: "Remember: Intercepted, at the CHI 20, returned!" },
    })
    expect(problems(quoting).join("\n")).toMatch(/its setup/)
  })

  it(`lets a line Kokoro says share ${QUOTE_RUN - 1} words in a row with a play, and the owner say anything in their own voice`, () => {
    expect(
      problems(
        withFirstBite({
          answer: {
            said: "It was pass short middle intended, and the stop held.",
          },
          transcript:
            "Pass short middle intended for the tight end, why would you do that.",
        })
      )
    ).toEqual([])
  })

  it("holds a bite read aloud by the second voice to it, since Kokoro says it", () => {
    const found = problems(
      withFirstBite({
        voice: "read-aloud",
        transcript:
          "Pass short middle intended for the tight end, why would you do that.",
      })
    )
    expect(found).toEqual([
      expect.stringMatching(/^sample-bite-1: read aloud: /),
    ])
  })
})

describe("an essay that contradicts itself", () => {
  it("orders bites by when they were said as times, whatever the offset or fraction", () => {
    const essay = sample()
    const [game] = essay.games
    const [first, second] = game?.halves ?? []
    if (game === undefined || first === undefined || second === undefined)
      throw new Error("the sample has two halves")
    const [bite] = second.bites
    if (bite === undefined)
      throw new Error("the sample's second half has a bite")
    const twice = (a: string, b: string): unknown => ({
      ...essay,
      games: [
        {
          ...game,
          halves: [
            first,
            {
              ...second,
              bites: [
                { ...bite, saidAt: a },
                { ...bite, take: "sample-bite-2b", saidAt: b },
              ],
            },
            ...game.halves.slice(2),
          ],
        },
      ],
    })
    const order =
      "401873010, the second half: its bites are not in the order they were said"
    // In order as text, out of order as times; then the other way round.
    expect(
      problems(twice("2026-10-23T02:00:00-05:00", "2026-10-23T03:00:00Z"))
    ).toContain(order)
    expect(
      problems(twice("2026-10-23T02:31:40Z", "2026-10-23T02:31:40.500Z"))
    ).not.toContain(order)
  })

  it("holds a matched bite's half to its play's quarter (C872), and its still to the two teams", () => {
    const [bite] = sample().games[0]?.halves[0]?.bites ?? []
    if (bite?.play == null)
      throw new Error("the sample's first bite is matched")
    expect(
      problems(
        withFirstBite({
          play: { ...bite.play, still: { ...bite.play.still, period: 4 } },
        })
      )
    ).toEqual([
      "sample-bite-1: its play is in the second half, and it is filed under the first half",
    ])
    expect(
      problems(
        withFirstBite({
          play: {
            ...bite.play,
            still: { ...bite.play.still, possession: "LV" },
          },
        })
      )
    ).toEqual(["sample-bite-1: its still gives the ball to a team not playing"])
  })

  it("is refused with every reason", () => {
    const essay = sample()
    const [game] = essay.games
    if (game === undefined) throw new Error("the sample has a game")
    const [first, second] = game.halves
    if (first === undefined || second === undefined)
      throw new Error("the sample has two halves")
    const found = problems({
      ...essay,
      week: { ...essay.week, to: "2026-10-01" },
      games: [
        {
          id: "2",
          away: "LV",
          home: "KC",
          kickoff: game.kickoff,
          game: { said: "Another game." },
          halves: [first],
        },
        {
          ...game,
          away: "CHI",
          halves: [second, first],
          halftime: undefined,
        },
      ],
    })
    expect(found).toEqual(
      expect.arrayContaining([
        "week: 2026-w43 runs from 2026-10-20 to 2026-10-26, Tuesday to Monday (C1241)",
        "bites: one take is in the essay twice",
        "401873010: a team plays itself",
        "401873010: its halves are out of the game's order, or one is there twice",
      ])
    )
  })

  it("puts the games of the team it is read for first (D3)", () => {
    const essay = sample()
    const [game] = essay.games
    if (game === undefined) throw new Error("the sample has a game")
    const ours = {
      ...game,
      id: "3",
      home: "SF",
      halves: game.halves.slice(0, 1),
      halftime: undefined,
    }
    const theirs = {
      ...game,
      halves: [
        {
          half: "first" as const,
          bites: (game.halves[0]?.bites ?? []).map((bite) => ({
            ...bite,
            take: `${bite.take}-x`,
          })),
        },
      ],
      halftime: undefined,
    }
    expect(problems({ ...essay, games: [theirs, ours] })).toContain(
      "games: SF's come first (D3)"
    )
    expect(problems({ ...essay, games: [ours, theirs] })).not.toContain(
      "games: SF's come first (D3)"
    )
  })

  it("says halftime only between bites of both halves (D10)", () => {
    const essay = sample()
    const [game] = essay.games
    if (game === undefined) throw new Error("the sample has a game")
    expect(
      problems({ ...essay, games: [{ ...game, halftime: undefined }] })
    ).toContain(
      "401873010: it has bites in both halves, so halftime is said between them (D10)"
    )
    expect(
      problems({
        ...essay,
        games: [{ ...game, halves: game.halves.slice(0, 1) }],
      })
    ).toContain("401873010: halftime is said only between bites of both halves")
  })

  it("says no halftime between the first half and overtime alone", () => {
    const essay = sample()
    const [game] = essay.games
    const [first, second] = game?.halves ?? []
    if (game === undefined || first === undefined || second === undefined)
      throw new Error("the sample has two halves")
    expect(
      problems({
        ...essay,
        games: [{ ...game, halves: [first, { ...second, half: "overtime" }] }],
      })
    ).toContain("401873010: halftime is said only between bites of both halves")
  })
})

describe("home's week file, as the essay files it (C1241, C1242)", () => {
  it("runs a week from the Tuesday of its ISO week to the Monday after", () => {
    expect(weekDaysOf("2026-w43")).toEqual({
      from: "2026-10-20",
      to: "2026-10-26",
    })
    expect(weekDaysOf("2026-w53")).toEqual({
      from: "2026-12-29",
      to: "2027-01-04",
    })
    expect(
      problems({
        ...sample(),
        week: { id: "2026-w43", from: "2026-10-19", to: "2026-10-25" },
      })
    ).toEqual([
      "week: 2026-w43 runs from 2026-10-20 to 2026-10-26, Tuesday to Monday (C1241)",
    ])
  })

  it("refuses a 53rd week in a year of 52, rather than throw", () => {
    expect(weekDaysOf("2025-w53")).toBeNull()
    expect(
      problems({
        ...sample(),
        week: { id: "2025-w53", from: "2025-12-30", to: "2026-01-05" },
      })
    ).toEqual(["week: 2025-w53 is not a week of its year"])
  })

  it("files a bite home gives no half by its scenario's phase, else by kickoff", () => {
    const kickoff = "2026-10-23T00:15:00Z"
    const mid = "2026-10-23T01:30:00Z"
    expect(gamePlaceOf("second", "in.turnover", mid, kickoff)).toBe("second")
    // A pre-game scenario said mid-game is still about before the game.
    expect(gamePlaceOf(null, "pre.weather", mid, kickoff)).toBe("before")
    // An in-game one said before home saw a play is the first half's.
    expect(gamePlaceOf(null, "in.first-drive", mid, kickoff)).toBe("first")
    expect(gamePlaceOf(null, "post.result", mid, kickoff)).toBe("after")
    // With no phase to go by, kickoff decides, as instants.
    expect(gamePlaceOf(null, null, "2026-10-22T23:00:00Z", kickoff)).toBe(
      "before"
    )
    expect(gamePlaceOf(null, "you.caught-it", kickoff, kickoff)).toBe("after")
    // Sorts before kickoff as text, and is after it as an instant.
    expect(gamePlaceOf(null, null, "2026-10-22T17:15:01-07:00", kickoff)).toBe(
      "after"
    )
  })

  it("orders bites within each placement, not across the game's", () => {
    const essay = sample()
    const [game] = essay.games
    if (game === undefined) throw new Error("the sample has a game")
    const [first] = game.halves
    const [bite] = first?.bites ?? []
    if (bite === undefined) throw new Error("the sample has a first-half bite")
    // A pre-game scenario said mid-game, filed before the game: said after
    // the first half's bite, and still not out of order.
    expect(
      problems({
        ...essay,
        games: [
          {
            ...game,
            halves: [
              {
                half: "before",
                bites: [
                  {
                    ...bite,
                    take: "sample-bite-0",
                    scenario: "pre.weather",
                    play: null,
                    saidAt: "2026-10-23T01:30:00Z",
                  },
                ],
              },
              ...game.halves,
            ],
          },
        ],
      })
    ).toEqual([])
  })

  it("keeps a bite said first and never mapped, with no scenario", () => {
    expect(problems(withFirstBite({ scenario: null }))).toEqual([])
  })

  it(`reads a bite aloud below ${READ_ALOUD_BELOW} confidence, unless the owner chose`, () => {
    expect(gameVoiceOf(0.58, null)).toBe("read-aloud")
    expect(gameVoiceOf(READ_ALOUD_BELOW, null)).toBe("owner")
    expect(gameVoiceOf(null, null)).toBe("owner")
    expect(gameVoiceOf(0.58, "owner")).toBe("owner")
    expect(gameVoiceOf(0.95, "read-aloud")).toBe("read-aloud")
  })
})
