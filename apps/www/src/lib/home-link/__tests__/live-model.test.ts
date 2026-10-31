/**
 * The app's half of the game day's live socket: where it opens, how the
 * phone stands with home after each close (every close home's
 * `dump-game-live-messages` lists), the clocks and the week kept.
 */
import { describe, expect, it } from "vitest"

import {
  clockSample,
  linkAfterClose,
  liveUrl,
  parseWeek,
  retryDelayMs,
  triesAgain,
} from "@/lib/home-link/live-model"

/** Home's closes, as `dump-game-live-messages` lists them. */
const CLOSES = [4400, 4426, 4401, 4408, 1001]

describe("the socket", () => {
  it("knows every close home ends the socket with", () => {
    const links = CLOSES.map(linkAfterClose)
    expect(links).toEqual(["away", "update", "unpaired", "away", "away"])
    expect(links.map(triesAgain)).toEqual([true, false, false, true, true])
  })

  it("opens where home serves it, over wss only", () => {
    expect(liveUrl("https://home.example/api/v1")).toBe(
      "wss://home.example/ws/game-week"
    )
    expect(liveUrl("https://home.example/api/file-host/api/v1")).toBe(
      "wss://home.example/api/file-host/ws/game-week"
    )
    expect(liveUrl("http://home.example/api/v1")).toBeNull()
    expect(liveUrl("not a url")).toBeNull()
  })
})

describe("the clocks", () => {
  it("takes home's reading halfway through the round trip", () => {
    expect(clockSample(1_000, 6_100, 1_200)).toEqual({
      offsetMs: 5_000,
      roundTripMs: 200,
    })
    expect(clockSample(2_000, 6_100, 1_200)).toBeNull()
  })

  it("waits a second, doubling to half a minute, before trying again", () => {
    expect([0, 1, 2, 5, 9].map(retryDelayMs)).toEqual([
      1_000, 2_000, 4_000, 30_000, 30_000,
    ])
  })
})

describe("the week kept on the phone", () => {
  it("reads back what was kept, and nothing else", () => {
    const week = [
      { id: "1", label: "SEA at SF", want: "SF win", kickoff: "2026-11-01" },
    ]
    expect(parseWeek(JSON.stringify(week))).toEqual(week)
    expect(parseWeek(JSON.stringify([{ id: "1" }]))).toBeNull()
    expect(parseWeek("{}")).toBeNull()
  })
})
