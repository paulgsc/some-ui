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
import type { TakeUses } from "@/lib/take-uses/model"
import { NO_USES } from "@/lib/take-uses/model"

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
  wentAt: null,
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

/** "Delete for good" tapped on `state`, with what uses its notes read then. */
const confirm = (
  state: DeletingState,
  uses: TakeUses = NO_USES
): DeletingState =>
  stepDeleting(state, {
    type: "confirmed",
    seq: state.seq,
    asks: state.asks,
    shown: state.shown,
    uses,
  })

/** `state` once its ask's read of uses landed. */
const read = (state: DeletingState, uses: TakeUses = NO_USES): DeletingState =>
  stepDeleting(state, { type: "usesRead", asks: state.asks, uses })

/** Uses of `t1`: part 1 of a spoken card, and maybe more. */
const usedBy = (...parts: ReadonlyArray<number>): TakeUses => ({
  of: new Map([
    [
      "t1",
      parts.map((part) => ({
        kind: "spoken" as const,
        card: "c1",
        title: "Who I am",
        part,
      })),
    ],
  ]),
  unread: [],
  doubts: [],
})

describe("the sheet's word on what uses its notes (INUSE, TU1)", () => {
  const asked = stepDeleting(INITIAL_DELETING, {
    type: "asked",
    of: "studio",
    ids: ["t1"],
  })
  const shown = read(asked, usedBy(1))

  it("shows what the read found, only for the ask it was read for", () => {
    expect(shown.sheet).toMatchObject({ kind: "asking", uses: usedBy(1) })
    expect(
      stepDeleting(asked, { type: "usesRead", asks: 0, uses: usedBy(1) })
    ).toBe(asked)
    // A later read never swaps what the owner is looking at.
    expect(
      stepDeleting(shown, { type: "usesRead", asks: 1, uses: NO_USES })
    ).toBe(shown)
  })

  it("deletes when the confirm's read finds nothing the sheet didn't show", () => {
    expect(confirm(shown, usedBy(1)).sheet.kind).toBe("deleting")
    // A use gone since takes less than the owner agreed to.
    expect(confirm(shown, NO_USES).sheet.kind).toBe("deleting")
  })

  it("asks again, never deletes, on a use that appeared since it showed", () => {
    const again = confirm(shown, usedBy(1, 2))
    expect(again.sheet).toMatchObject({
      kind: "asking",
      uses: usedBy(1, 2),
      changed: "use",
    })
    expect(again.seq).toBe(shown.seq)
    // Seen now, the next confirm deletes.
    expect(confirm(again, usedBy(1, 2)).sheet.kind).toBe("deleting")
  })

  it("deletes nothing on a tap made while it said it was checking, whatever lands first", () => {
    // Tapped while checking; the first read lands, then the tap's.
    const tapped = asked
    const landed = read(asked, usedBy(1))
    expect(
      stepDeleting(landed, {
        type: "confirmed",
        seq: tapped.seq,
        asks: tapped.asks,
        shown: tapped.shown,
        uses: usedBy(1),
      })
    ).toBe(landed)
    expect(confirm(asked, NO_USES)).toBe(asked)
  })

  it("deletes nothing on a second tap once the first asked again", () => {
    const again = confirm(shown, usedBy(1, 2))
    expect(again.sheet).toMatchObject({ kind: "asking", changed: "use" })
    // The second tap was made on what the sheet showed before.
    expect(
      stepDeleting(again, {
        type: "confirmed",
        seq: shown.seq,
        asks: shown.asks,
        shown: shown.shown,
        uses: usedBy(1, 2),
      })
    ).toBe(again)
  })

  it("asks again when a store it read turns unread", () => {
    const unread: TakeUses = { ...usedBy(1), unread: ["videos"], doubts: [] }
    const again = confirm(shown, unread)
    // Asked again, but nothing started using it: it can't read a store now.
    expect(again.sheet).toMatchObject({
      kind: "asking",
      uses: unread,
      changed: "unread",
    })
    // Shown unread, and still unread: the owner agreed to that.
    expect(confirm(again, unread).sheet.kind).toBe("deleting")
  })

  it("drops a confirm tapped on an earlier ask, or before an earlier confirm", () => {
    // Keep it, then Delete… on another take: the first tap's read lands.
    const other = read(
      stepDeleting(stepDeleting(shown, { type: "closed" }), {
        type: "asked",
        of: "studio",
        ids: ["t2"],
      })
    )
    expect(
      stepDeleting(other, {
        type: "confirmed",
        seq: shown.seq,
        asks: shown.asks,
        shown: shown.shown,
        uses: NO_USES,
      })
    ).toBe(other)
    // Two taps: the first deletes, the second's read changes nothing,
    // even once home answered and the sheet offers Try again.
    const deleting = confirm(shown, usedBy(1))
    const ended = stepDeleting(deleting, {
      type: "answered",
      seq: deleting.seq,
      end: endOf({ kind: "unreachable" }),
    })
    expect(
      stepDeleting(ended, {
        type: "confirmed",
        seq: shown.seq,
        asks: shown.asks,
        shown: shown.shown,
        uses: usedBy(1),
      })
    ).toBe(ended)
  })

  it("asks again on Try again when a use appeared since", () => {
    const deleting = confirm(shown, usedBy(1))
    const ended = stepDeleting(deleting, {
      type: "answered",
      seq: deleting.seq,
      end: endOf({ kind: "unreachable" }),
    })
    expect(confirm(ended, usedBy(1, 3)).sheet).toMatchObject({
      kind: "asking",
      ids: ["t1"],
      changed: "use",
    })
    expect(confirm(ended, usedBy(1)).sheet.kind).toBe("deleting")
  })
})

describe("the sheet's step", () => {
  const asked = stepDeleting(INITIAL_DELETING, {
    type: "asked",
    of: "studio",
    ids: ["t1", "t1", "t2"],
  })
  const asking = read(asked)

  it("asks once, then deletes only on confirm", () => {
    expect(asked.sheet).toEqual({
      kind: "asking",
      of: "studio",
      ids: ["t1", "t2"],
      uses: null,
      changed: false,
    })
    // Nothing deletes while it says it is checking.
    expect(confirm(asked)).toBe(asked)
    expect(stepDeleting(asking, { type: "closed" }).sheet).toEqual({
      kind: "closed",
    })
    const deleting = confirm(asking)
    expect(deleting).toEqual({
      seq: 1,
      asks: 1,
      shown: 2,
      sheet: {
        kind: "deleting",
        of: "studio",
        ids: ["t1", "t2"],
        uses: NO_USES,
      },
    })
    // Nothing closes, asks again or confirms again while it deletes.
    expect(stepDeleting(deleting, { type: "closed" })).toBe(deleting)
    expect(confirm(deleting)).toBe(deleting)
    expect(
      stepDeleting(deleting, { type: "asked", of: "studio", ids: ["t9"] })
    ).toBe(deleting)
  })

  it("ends on every answer, and offers Try again only where home was silent", () => {
    const deleting = confirm(asking)
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
        uses: NO_USES,
        end,
      })
      const retried = confirm(ended)
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
    const first = confirm(asking)
    const end = endOf({
      kind: "answered",
      answers: [{ id: "t1", answer: gone(RECEIPT) }],
    })
    expect(stepDeleting(first, { type: "answered", seq: 0, end })).toBe(first)
    const ended = stepDeleting(first, { type: "answered", seq: 1, end })
    // Done, then another recording asked about and confirmed.
    const second: DeletingState = confirm(
      read(
        stepDeleting(stepDeleting(ended, { type: "closed" }), {
          type: "asked",
          of: "studio",
          ids: ["t3"],
        })
      )
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
  it("offers Delete… on what home marks deletable, of any kind (HEARD5)", () => {
    expect(offersDelete("reflection", ITEM, [])).toBe(true)
    expect(offersDelete("reflection", { ...ITEM, deletable: false }, [])).toBe(
      false
    )
    // A store not handed in, or not known yet: its copy couldn't be let go.
    expect(offersDelete("studio", ITEM, [])).toBe(true)
    expect(offersDelete("studio", ITEM, ["studio"])).toBe(false)
    expect(offersDelete("soundbite", ITEM, ["soundbite"])).toBe(false)
    expect(offersDelete("soundbite", ITEM, null)).toBe(false)
    expect(offersDelete("reflection", ITEM, null)).toBe(true)
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
