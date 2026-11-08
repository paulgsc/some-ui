/**
 * @vitest-environment node
 *
 * Home's render jobs as the phone reads them (SFEED13): the shape
 * paulgsc/server's `feeds::renders` answers, and every other answer.
 */
import { describe, expect, it } from "vitest"

import { readBoard, rendering } from "@/lib/renders/model"

/** As `GET /renders` answers, from the server's own test of it. */
const BOARD = {
  now: {
    feed: "call",
    key: "2026-11-06",
    state: "rendering",
    since: 1794130000,
    stateSince: 1794139140,
    gaveWay: 1,
    heldBy: null,
    stuck: false,
    estimate: { share: 0.6, secondsLeft: 240 },
  },
  waiting: [{ feed: "playoff-delta", key: "2026-SF-09", at: 1794052800 }],
  failed: [
    {
      feed: "call",
      key: "2026-10-30",
      at: 1794052800,
      by: "recorder",
      exit: 1,
    },
  ],
  done: [{ feed: "call", key: "2026-10-23", at: 1793843200 }],
  coming: [{ feed: "call", on: "2026-11-13" }],
}

const answer = (status: number, body: unknown) => ({
  status,
  body: JSON.stringify(body),
})

describe("readBoard", () => {
  it("reads home's board", () => {
    const read = readBoard(answer(200, BOARD))
    expect(read.kind).toBe("read")
    if (read.kind === "read") expect(rendering(read.board)).toBe(true)
  })

  it("reads a home with nothing to say", () => {
    const empty = { now: null, waiting: [], failed: [], done: [], coming: [] }
    const read = readBoard(answer(200, empty))
    expect(read.kind === "read" && !rendering(read.board)).toBe(true)
  })

  it("names a home from before the read, and an answer it can't read", () => {
    expect(readBoard(answer(404, {}))).toEqual({ kind: "older" })
    expect(readBoard(answer(500, {}))).toEqual({ kind: "unreadable" })
    expect(readBoard(answer(200, { now: null }))).toEqual({
      kind: "unreadable",
    })
    expect(
      readBoard(
        answer(200, { ...BOARD, now: { ...BOARD.now, heldBy: "lane" } })
      )
    ).toEqual({
      kind: "unreadable",
    })
  })
})
