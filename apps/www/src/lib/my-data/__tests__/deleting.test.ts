/**
 * @vitest-environment node
 *
 * My data's delete (MD3, #2477): what each of home's answers means, the
 * sheet's step over every one of them, and that nothing offers Delete… on a
 * recording home doesn't mark deletable.
 */
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type { DeleteAsked } from "@/lib/home-link/delete-note"
import type { DeleteEnd, DeletingState, Receipt } from "@/lib/my-data/deleting"
import {
  endOf,
  INITIAL_DELETING,
  offersDelete,
  readDeletion,
  readReceipts,
  retryable,
  stepDeleting,
} from "@/lib/my-data/deleting"
import type { KindItem } from "@/lib/my-data/model"

const RECEIPT: Receipt = {
  id: "t1",
  of: "studio",
  recordedAt: "2026-11-01T10:00:00.000Z",
  storedAt: "2026-11-01T10:05:00.000Z",
  size: 120,
  deletedAt: "2026-11-03T09:00:00.000Z",
  went: ["recording", "words"],
  stayed: ["drive copy"],
}

const gone = (receipt: Receipt): HomeAnswer => ({
  status: 200,
  body: JSON.stringify({ receipt }),
})

const ITEM: KindItem = {
  id: "t1",
  at: "2026-11-01T10:00:00.000Z",
  bytes: 120,
  where: "home",
  plays: "here",
  durationMs: null,
  heard: { kind: "notYet" },
  deletable: true,
}

describe("what home's answer to a delete says", () => {
  it("reads a receipt, a 409, a 404, a 401, and silence", () => {
    expect(readDeletion(gone(RECEIPT))).toEqual({
      kind: "gone",
      receipt: RECEIPT,
    })
    expect(readDeletion({ status: 409, body: "{}" })).toEqual({
      kind: "kept",
    })
    expect(readDeletion({ status: 404, body: "{}" })).toEqual({
      kind: "notHeld",
    })
    expect(readDeletion({ status: 401, body: "" })).toEqual({
      kind: "forgotten",
    })
    for (const answer of [
      null,
      { status: 503, body: "" },
      { status: 429, body: "" },
      { status: 200, body: "not a receipt" },
      { status: 200, body: JSON.stringify({ receipt: { id: "t1" } }) },
    ])
      expect(readDeletion(answer)).toEqual({ kind: "unanswered" })
  })

  it("adds up a run, and says nothing was answered when nothing was", () => {
    const asked: DeleteAsked = {
      kind: "answered",
      answers: [
        { id: "t1", answer: gone(RECEIPT) },
        { id: "t2", answer: { status: 409, body: "{}" } },
        { id: "t3", answer: { status: 404, body: "{}" } },
        { id: "t4", answer: null },
      ],
    }
    expect(endOf(asked)).toEqual({
      kind: "answered",
      gone: [RECEIPT],
      kept: 1,
      notHeld: 1,
      forgotten: 0,
      unanswered: ["t4"],
      letGo: "letting",
    })
    expect(
      endOf({
        kind: "answered",
        answers: [{ id: "t1", answer: { status: 409, body: "{}" } }],
      })
    ).toMatchObject({ kind: "answered", gone: [], letGo: null })
    expect(
      endOf({
        kind: "answered",
        answers: [
          { id: "t1", answer: { status: 502, body: "" } },
          { id: "t2", answer: null },
        ],
      })
    ).toEqual({ kind: "unreachable" })
    for (const kind of ["unpaired", "busy", "unreachable"] as const)
      expect(endOf({ kind })).toEqual({ kind })
  })

  it("asks again only for what home didn't answer, never a final answer", () => {
    const ids = ["t1", "t2", "t3"]
    const answered = (over: Partial<DeleteEnd>): DeleteEnd => ({
      kind: "answered",
      gone: [],
      kept: 0,
      notHeld: 0,
      forgotten: 0,
      unanswered: [],
      letGo: null,
      ...over,
    })
    expect(retryable(ids, answered({ kept: 2, notHeld: 1 }))).toEqual([])
    expect(retryable(ids, answered({ kept: 1, unanswered: ["t3"] }))).toEqual([
      "t3",
    ])
    expect(
      retryable(ids, answered({ forgotten: 1, unanswered: ["t3"] }))
    ).toEqual([])
    expect(retryable(ids, { kind: "unreachable" })).toEqual(ids)
    expect(retryable(ids, { kind: "busy" })).toEqual(ids)
    expect(retryable(ids, { kind: "unpaired" })).toEqual([])
  })
})

describe("the sheet's step", () => {
  const asking = stepDeleting(INITIAL_DELETING, {
    type: "asked",
    of: "studio",
    ids: ["t1", "t1", "t2"],
  })

  it("asks once, then deletes only on confirm", () => {
    expect(asking.sheet).toEqual({
      kind: "asking",
      of: "studio",
      ids: ["t1", "t2"],
    })
    expect(stepDeleting(asking, { type: "closed" }).sheet).toEqual({
      kind: "closed",
    })
    const deleting = stepDeleting(asking, { type: "confirmed" })
    expect(deleting).toEqual({
      seq: 1,
      sheet: { kind: "deleting", of: "studio", ids: ["t1", "t2"] },
    })
    // Nothing closes, asks again or confirms again while it deletes.
    expect(stepDeleting(deleting, { type: "closed" })).toBe(deleting)
    expect(stepDeleting(deleting, { type: "confirmed" })).toBe(deleting)
    expect(
      stepDeleting(deleting, { type: "asked", of: "studio", ids: ["t9"] })
    ).toBe(deleting)
  })

  it("ends on every answer, and offers Try again only where home was silent", () => {
    const deleting = stepDeleting(asking, { type: "confirmed" })
    const ends: ReadonlyArray<DeleteEnd> = [
      endOf({ kind: "unpaired" }),
      endOf({ kind: "busy" }),
      endOf({ kind: "unreachable" }),
      endOf({
        kind: "answered",
        answers: [
          { id: "t1", answer: gone(RECEIPT) },
          { id: "t2", answer: gone({ ...RECEIPT, id: "t2" }) },
        ],
      }),
      endOf({
        kind: "answered",
        answers: [
          { id: "t1", answer: { status: 409, body: "" } },
          { id: "t2", answer: { status: 404, body: "" } },
        ],
      }),
      endOf({
        kind: "answered",
        answers: [
          { id: "t1", answer: gone(RECEIPT) },
          { id: "t2", answer: null },
        ],
      }),
    ]
    const again = ends.map((end) => {
      const ended = stepDeleting(deleting, { type: "answered", seq: 1, end })
      expect(ended.sheet).toEqual({
        kind: "ended",
        of: "studio",
        ids: ["t1", "t2"],
        end,
      })
      const retried = stepDeleting(ended, { type: "confirmed" })
      return retried.sheet.kind === "deleting" ? retried.sheet.ids : null
    })
    expect(again).toEqual([
      null,
      ["t1", "t2"],
      ["t1", "t2"],
      null,
      null,
      ["t2"],
    ])
  })

  it("drops an answer, or a let-go, to an earlier confirm", () => {
    const first = stepDeleting(asking, { type: "confirmed" })
    const end = endOf({
      kind: "answered",
      answers: [{ id: "t1", answer: gone(RECEIPT) }],
    })
    expect(stepDeleting(first, { type: "answered", seq: 0, end })).toBe(first)
    const ended = stepDeleting(first, { type: "answered", seq: 1, end })
    // Done, then another recording asked about and confirmed.
    const second: DeletingState = stepDeleting(
      stepDeleting(stepDeleting(ended, { type: "closed" }), {
        type: "asked",
        of: "studio",
        ids: ["t3"],
      }),
      { type: "confirmed" }
    )
    expect(second.seq).toBe(2)
    expect(
      stepDeleting(second, { type: "letGoEnded", seq: 1, let: true })
    ).toBe(second)
    expect(stepDeleting(second, { type: "answered", seq: 1, end })).toBe(second)
    const failed = stepDeleting(ended, {
      type: "letGoEnded",
      seq: 1,
      let: false,
    })
    expect(failed.sheet).toMatchObject({ end: { letGo: "failed" } })
  })
})

describe("what My data offers to delete", () => {
  it("offers Delete… only on what home marks deletable, of a kind this phone lets go", () => {
    expect(offersDelete("studio", ITEM, [])).toBe(true)
    expect(offersDelete("studio", { ...ITEM, deletable: false }, [])).toBe(
      false
    )
    expect(offersDelete("reflection", ITEM, [])).toBe(false)
    expect(offersDelete("soundbite", ITEM, [])).toBe(false)
    // Studio's store not handed in: this phone couldn't let its copy go.
    expect(offersDelete("studio", ITEM, ["studio"])).toBe(false)
  })
})

describe("the receipts read", () => {
  it("reads home's receipts, an older home, and silence", () => {
    expect(
      readReceipts({
        status: 200,
        body: JSON.stringify({ receipts: [RECEIPT], total: 3 }),
      })
    ).toEqual({ kind: "read", receipts: [RECEIPT], total: 3 })
    expect(readReceipts({ status: 404, body: "" })).toEqual({ kind: "older" })
    expect(readReceipts({ status: 405, body: "" })).toEqual({ kind: "older" })
    expect(readReceipts({ status: 500, body: "" })).toEqual({
      kind: "unreachable",
    })
    expect(readReceipts({ status: 200, body: "{}" })).toEqual({
      kind: "unreachable",
    })
  })
})
