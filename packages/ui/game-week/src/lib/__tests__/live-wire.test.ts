/**
 * The recorder reads every message home's game day socket sends, and writes
 * every one it sends as home reads it: `game-live-messages.snapshot.json`
 * is paulgsc/server's `dump-game-live-messages`, kept here (the server's
 * `check_client_fixtures.py` compares this copy with a fresh dump).
 */
import { helloText, pingText, readHome } from "@game-week/lib/live-wire"
import { describe, expect, it } from "vitest"

import messages from "./game-live-messages.snapshot.json"

const homeText = (at: number): string => JSON.stringify(messages.home[at])

describe("what home sends", () => {
  it("reads a live offer as the recorder shows it", () => {
    const read = readHome(homeText(0))
    expect(read).toEqual({
      kind: "offer",
      seq: 1_761_178_000_042,
      following: true,
      games: [
        {
          id: "401873010",
          label: "NE at CHI",
          want: "",
          kickoff: "2026-10-23T00:15:00Z",
        },
        {
          id: "401873023",
          label: "SEA at SF",
          want: "SF win",
          kickoff: "2026-10-26T20:25:00Z",
        },
      ],
      offer: {
        seq: 1_761_178_000_042,
        gameId: "401873010",
        strip:
          "8:42 left in the 3rd · NE has the ball · 3rd and 8 at the CHI 35 · CHI 13, NE 7",
        cards: [
          { scenario: "in.third-long", context: "3rd and 8, down 6", rank: 1 },
          { scenario: "in.play-call", context: "NE on 3rd and 8", rank: 2 },
        ],
        justHappened: [
          {
            scenario: "in.sack",
            context: "NE sacked on 2nd and 5",
            at: "2026-10-23T01:52:20Z",
          },
        ],
      },
    })
  })

  it("reads every message in home's examples", () => {
    const kinds = messages.home.map((_, at) => readHome(homeText(at)).kind)
    expect(kinds).toEqual(["offer", "offer", "offer", "pong"])
    expect(readHome(homeText(1))).toMatchObject({
      offer: { strip: "Kickoff in 2 h 10 min", cards: [], justHappened: [] },
    })
    expect(readHome(homeText(2))).toMatchObject({
      following: false,
      games: [],
      offer: null,
    })
    expect(readHome(homeText(3))).toEqual({
      kind: "pong",
      phoneAt: 1_761_178_500_000,
      homeAt: 1_761_178_500_012,
    })
  })

  it("leaves out a scenario this build doesn't know, and guesses at nothing else", () => {
    const live = messages.home[0]!
    const newer = {
      ...live,
      offer: {
        ...live.offer,
        scenarios: [
          { id: "in.added-later", line: "A moment a later catalog has" },
          ...(live.offer?.scenarios ?? []).slice(1),
        ],
      },
    }
    const read = readHome(JSON.stringify(newer))
    expect(read.kind === "offer" && read.offer?.cards).toEqual([
      { scenario: "in.play-call", context: "NE on 3rd and 8", rank: 1 },
    ])
    expect(readHome(JSON.stringify({ ...newer, v: 2 }))).toEqual({
      kind: "version",
    })
    expect(readHome("not json")).toEqual({ kind: "unreadable" })
    expect(readHome(JSON.stringify({ ...newer, seq: "41" }))).toEqual({
      kind: "unreadable",
    })
    expect(
      readHome(JSON.stringify({ ...newer, offer: { gameId: "x" } }))
    ).toEqual({ kind: "unreadable" })
  })
})

describe("what the phone sends", () => {
  it("writes each of home's phone examples as home reads them", () => {
    const [first, second, ping] = messages.phone
    expect(
      JSON.parse(
        helloText({ mode: "standard", gameId: null, watching: {} }, null, -420)
      )
    ).toEqual(first)
    expect(
      JSON.parse(
        helloText(
          {
            mode: "full",
            gameId: "401873010",
            watching: { "401873010": true, "401873023": false },
          },
          1_761_178_000_041,
          -420
        )
      )
    ).toEqual(second)
    expect(JSON.parse(pingText(1_761_178_500_000))).toEqual(ping)
  })

  it("names where home serves it", () => {
    expect(messages.path).toBe("/ws/game-week")
    expect(messages.protocol).toBe("game-week.v1")
  })
})
