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
  parseGameEssay,
  QUOTE_RUN,
  sampleGameEssay,
  STANCES,
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

  it(`refuses a line the host says that repeats ${QUOTE_RUN} words of a play's text in a row (our words, never theirs)`, () => {
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

  it(`lets a host line share ${QUOTE_RUN - 1} words in a row with a play, and the owner say anything in their own voice`, () => {
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
    const at = (half: typeof first, ...times: Array<string>): typeof first => ({
      ...half,
      bites: half.bites.map((bite, i) => ({
        ...bite,
        saidAt: times[i] ?? bite.saidAt,
      })),
    })
    const order = "401873010: its bites are not in the order they were said"
    expect(
      problems({
        ...essay,
        games: [
          {
            ...game,
            halves: [
              at(first, "2026-10-23T02:00:00-05:00"),
              at(second, "2026-10-23T03:00:00Z"),
            ],
          },
        ],
      })
    ).toContain(order)
    expect(
      problems({
        ...essay,
        games: [
          {
            ...game,
            halves: [
              at(first, "2026-10-23T00:52:10Z"),
              at(second, "2026-10-23T00:52:10.500Z", "2026-10-23T00:53:00Z"),
            ],
          },
        ],
      })
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
        "week: it ends before it starts",
        "bites: one take is in the essay twice",
        "401873010: a team plays itself",
        "401873010: its halves are out of the game's order, or one is there twice",
        "401873010: its bites are not in the order they were said",
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
