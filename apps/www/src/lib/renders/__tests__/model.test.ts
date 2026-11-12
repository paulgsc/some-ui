/**
 * @vitest-environment node
 *
 * Home's render jobs as the phone reads them (SFEED13): the shape
 * paulgsc/server's `feeds::renders` answers, and every other answer.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { readBoard, underWay } from "@/lib/renders/model"

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

const answer = (status: number, body: unknown): HomeAnswer => ({
  status,
  body: JSON.stringify(body),
})

describe("readBoard", () => {
  it("reads a board with previews on it, and its extras (#2899)", () => {
    const withPreviews = {
      ...BOARD,
      now: {
        ...BOARD.now,
        feed: "preview",
        key: "conference-call-20261112T024837Z",
        template: "conference-call",
        estimate: null,
      },
      done: [
        ...BOARD.done,
        {
          feed: "preview",
          key: "rust-essay-20261111T010000Z",
          template: "rust-essay",
          at: 1793843200,
          expiresAt: 1793929600,
        },
      ],
      failed: [
        {
          ...BOARD.failed[0],
          feed: "preview",
          key: "rust-essay-x",
          template: "rust-essay",
          reason: "no-sample",
        },
      ],
    }
    const read = readBoard(answer(200, withPreviews))
    expect(read.kind).toBe("read")
    if (read.kind !== "read") return
    expect(read.board.now?.template).toBe("conference-call")
    expect(read.board.done[1]?.expiresAt).toBe(1793929600)
    expect(read.board.failed[0]?.reason).toBe("no-sample")
  })

  it("reads home's board, with something under way", () => {
    const read = readBoard(answer(200, BOARD))
    expect(read.kind).toBe("read")
    if (read.kind === "read") expect(underWay(read.board)).toBe(true)
  })

  it("reads a home with nothing to say", () => {
    const empty = { now: null, waiting: [], failed: [], done: [], coming: [] }
    const read = readBoard(answer(200, empty))
    expect(read.kind === "read" && !underWay(read.board)).toBe(true)
  })

  it("names a home from before the read, and an answer it can't read", () => {
    expect(readBoard(answer(404, {}))).toEqual({ kind: "older" })
    expect(readBoard(answer(500, {}))).toEqual({ kind: "unreadable" })
    expect(readBoard(answer(200, "not a board"))).toEqual({
      kind: "unreadable",
    })
  })
})
