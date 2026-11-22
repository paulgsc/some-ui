/** @vitest-environment node */
/**
 * A game's moment log as Takes reads it (GWB14 D15): an answer stands only
 * for the game asked about, and the log is read again only while the game
 * is on.
 */
import { isRecord } from "@some-ui/core-utils"
import type { GameMoments } from "@some-ui/game-week"
import { describe, expect, it } from "vitest"

import { PhoneBusyError } from "@/lib/phone-busy"

import type { MomentsReader } from "./model"
import { momentsAgainIn, readGameMoments, WHILE_ON_MS } from "./model"

const LOG = {
  gameId: "401873010",
  engineVersion: 7,
  catalogVersion: 2,
  final: false,
  moments: [
    {
      id: "in.turnover",
      playId: "4018730101210",
      line: "CHI intercepted at the NE 40",
      at: "2026-10-23T01:10:00Z",
      unit: "defense",
      unitSide: "CHI",
      period: 3,
      clock: "4:12",
    },
  ],
}

/**
 * A stand-in for the recorder's reader, which the build stubs out of this
 * profile (it is the phone's alone) and tests against home's shape itself.
 */
const reader: MomentsReader = (value) =>
  isRecord(value) && typeof value.gameId === "string"
    ? // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in reader: the shape is game-week's to check
      (value as GameMoments)
    : null

const answer = (
  status: number,
  body: unknown = LOG
): { status: number; body: string } => ({
  status,
  body: JSON.stringify(body),
})

describe("a game's moments, read (GWB14 D15)", () => {
  it("reads the log of the game asked about", () => {
    const read = readGameMoments(answer(200), "401873010", reader)
    expect(read?.kind).toBe("read")
    expect(read?.kind === "read" && read.log.moments[0]?.clock).toBe("4:12")
  })

  it("never takes another game's log for the one asked about", () => {
    expect(readGameMoments(answer(200), "401999999", reader)).toBeNull()
  })

  it("says home keeps none on a 404, and reads nothing else it can't", () => {
    expect(readGameMoments(answer(404, {}), "401873010", reader)).toEqual({
      kind: "none",
    })
    expect(readGameMoments(answer(500, {}), "401873010", reader)).toBeNull()
    expect(
      readGameMoments({ status: 200, body: "not json" }, "401873010", reader)
    ).toBeNull()
  })

  it("reads again each minute while the game is on, or the phone was busy, and never once it is over", () => {
    const on = readGameMoments(answer(200), "401873010", reader) ?? undefined
    const over =
      readGameMoments(
        answer(200, { ...LOG, final: true }),
        "401873010",
        reader
      ) ?? undefined
    expect(momentsAgainIn({ error: null, data: on })).toBe(WHILE_ON_MS)
    expect(momentsAgainIn({ error: null, data: over })).toBe(false)
    expect(momentsAgainIn({ error: null, data: { kind: "none" } })).toBe(false)
    expect(
      momentsAgainIn({ error: new PhoneBusyError("busy"), data: on })
    ).toBe(WHILE_ON_MS)
    expect(momentsAgainIn({ error: new Error("away"), data: on })).toBe(false)
  })
})
