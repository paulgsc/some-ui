/**
 * @vitest-environment node
 *
 * My data's delete runtime (MD3, #2477): one run per confirm, the phone's
 * let-go on home's receipt alone (and after a stale one too), and My data
 * read again after.
 */
import { describe, expect, it } from "vitest"

import type { DeleteAsked } from "@/lib/home-link/delete-note"
import type { DeletingPorts } from "@/lib/my-data/deleting-runtime"
import { createDeleting } from "@/lib/my-data/deleting-runtime"
import type { TakeUses } from "@/lib/take-uses/model"
import { NO_USES } from "@/lib/take-uses/model"

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

const receipt = (id: string): string =>
  JSON.stringify({
    receipt: {
      id,
      of: "studio",
      recordedAt: "2026-11-01T10:00:00.000Z",
      storedAt: "2026-11-01T10:05:00.000Z",
      size: 120,
      deletedAt: "2026-11-03T09:00:00.000Z",
      went: ["recording"],
      stayed: [],
    },
  })

function ports(): {
  ports: DeletingPorts
  asked: Array<{
    ids: ReadonlyArray<string>
    answer: Deferred<DeleteAsked>
  }>
  letGo: Array<{ ids: ReadonlyArray<string>; done: Deferred<boolean> }>
  reread: { count: number }
  /** What the next read of uses finds. */
  uses: { now: TakeUses }
  /** The let-go, the run's end and the reread, in the order they came. */
  order: Array<string>
} {
  const asked: Array<{
    ids: ReadonlyArray<string>
    answer: Deferred<DeleteAsked>
  }> = []
  const letGo: Array<{
    ids: ReadonlyArray<string>
    done: Deferred<boolean>
  }> = []
  const reread = { count: 0 }
  const uses = { now: NO_USES }
  const order: Array<string> = []
  /** Whether the delete's run holds the link, as `deleteNotes` keeps it. */
  let inRun = false
  return {
    asked,
    letGo,
    reread,
    uses,
    order,
    ports: {
      uses: () => Promise.resolve(uses.now),
      failed: (): void => undefined,
      deleteNotes: async (ids, settle): Promise<DeleteAsked> => {
        const answer = deferred<DeleteAsked>()
        asked.push({ ids, answer })
        const said = await answer.promise
        inRun = true
        try {
          await settle(said)
        } finally {
          inRun = false
          order.push("run ended")
        }
        return said
      },
      letGo: (_of, ids): Promise<boolean> => {
        order.push(inRun ? "let go in the run" : "let go after it")
        const done = deferred<boolean>()
        letGo.push({ ids, done })
        return done.promise
      },
      reread: (): void => {
        order.push(inRun ? "reread in the run" : "reread after it")
        reread.count += 1
      },
    },
  }
}

describe("My data's delete runtime", () => {
  it("sends nothing until the sheet is confirmed, and once per confirm", async () => {
    const { ports: p, asked } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1"])
    await flush()
    expect(asked).toHaveLength(0)
    deleting.confirm()
    deleting.confirm()
    await flush()
    expect(asked.map((each) => each.ids)).toEqual([["t1"]])
    expect(deleting.getSnapshot().sheet.kind).toBe("deleting")
  })

  it("lets go of this phone's copy of what home answered with a receipt, and only that, then reads My data again", async () => {
    const { ports: p, asked, letGo, reread } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1", "t2", "t3"])
    await flush()
    deleting.confirm()
    await flush()
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [
        { id: "t1", answer: { status: 200, body: receipt("t1") } },
        { id: "t2", answer: { status: 409, body: "{}" } },
        { id: "t3", answer: null },
      ],
    })
    await flush()
    expect(letGo.map((each) => each.ids)).toEqual([["t1"]])
    expect(deleting.getSnapshot().sheet).toMatchObject({
      kind: "ended",
      end: { letGo: "letting", kept: 1, unanswered: ["t3"] },
    })
    letGo[0]?.done.resolve(true)
    await flush()
    expect(deleting.getSnapshot().sheet).toMatchObject({
      end: { letGo: "let" },
    })
    expect(reread.count).toBe(1)
  })

  it("lets nothing go when home didn't delete anything", async () => {
    const { ports: p, asked, letGo, reread } = ports()
    const deleting = createDeleting(p)
    for (const answer of [
      { kind: "unreachable" },
      { kind: "busy" },
      { kind: "unpaired" },
      {
        kind: "answered",
        answers: [{ id: "t1", answer: { status: 404, body: "{}" } }],
      },
    ] as const) {
      deleting.close()
      deleting.ask("studio", ["t1"])
      await flush()
      deleting.confirm()
      await flush()
      asked.at(-1)?.answer.resolve(answer)
      await flush()
      expect(deleting.getSnapshot().sheet.kind).toBe("ended")
    }
    expect(letGo).toEqual([])
    expect(reread.count).toBe(0)
  })

  it("sends nothing when a use appeared between the sheet opening and its confirm (INUSE, TU1)", async () => {
    const { ports: p, asked, uses } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1"])
    await flush()
    expect(deleting.getSnapshot().sheet).toMatchObject({ uses: NO_USES })
    // Picked for a spoken card's part while the sheet stood open.
    uses.now = {
      of: new Map([
        ["t1", [{ kind: "spoken", card: "c1", title: "T", part: 1 }]],
      ]),
      unread: [],
    }
    deleting.confirm()
    await flush()
    expect(asked).toHaveLength(0)
    expect(deleting.getSnapshot().sheet).toMatchObject({
      kind: "asking",
      changed: true,
      uses: uses.now,
    })
    deleting.confirm()
    await flush()
    expect(asked.map((each) => each.ids)).toEqual([["t1"]])
  })

  it("still lets go after a stale let-go, which changes nothing on the sheet shown now", async () => {
    const { ports: p, asked, letGo } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1"])
    await flush()
    deleting.confirm()
    await flush()
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [{ id: "t1", answer: { status: 200, body: receipt("t1") } }],
    })
    await flush()
    // Done before this phone's copy has gone, then another take asked about.
    deleting.close()
    deleting.ask("studio", ["t2"])
    await flush()
    deleting.confirm()
    await flush()
    letGo[0]?.done.resolve(false)
    await flush()
    expect(deleting.getSnapshot().sheet).toEqual({
      kind: "deleting",
      of: "studio",
      ids: ["t2"],
      uses: NO_USES,
    })
    expect(letGo.map((each) => each.ids)).toEqual([["t1"]])
  })

  it("asks again on Try again for what home didn't answer, and never for a final answer", async () => {
    const { ports: p, asked } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1", "t2"])
    await flush()
    deleting.confirm()
    await flush()
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [
        { id: "t1", answer: { status: 409, body: "{}" } },
        { id: "t2", answer: null },
      ],
    })
    await flush()
    deleting.confirm()
    await flush()
    asked[1]?.answer.resolve({
      kind: "answered",
      answers: [{ id: "t2", answer: { status: 409, body: "{}" } }],
    })
    await flush()
    deleting.confirm()
    await flush()
    expect(asked.map((each) => each.ids)).toEqual([["t1", "t2"], ["t2"]])
  })

  it("lets go inside the delete's run, and reads My data again once the run has ended", async () => {
    const { ports: p, asked, letGo, order } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1"])
    await flush()
    deleting.confirm()
    await flush()
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [{ id: "t1", answer: { status: 200, body: receipt("t1") } }],
    })
    await flush()
    expect(order).toEqual(["let go in the run"])
    letGo[0]?.done.resolve(true)
    await flush()
    expect(order).toEqual(["let go in the run", "run ended", "reread after it"])
  })
})
