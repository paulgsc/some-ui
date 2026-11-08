/**
 * @vitest-environment node
 *
 * My data's delete runtime (MD3, #2477): one run per confirm, the phone's
 * let-go on home's receipt alone (and after a stale one too), and My data
 * read again after.
 */
import { describe, expect, it } from "vitest"

import type { DeleteAsked } from "@/lib/home-link/delete-note"
import type { OwedDelete } from "@/lib/home-link/deleting-notes"
import type { ReceiptsReading } from "@/lib/my-data/deleting"
import type { DeletingPorts } from "@/lib/my-data/deleting-runtime"
import { createDeleting } from "@/lib/my-data/deleting-runtime"

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
  /** The notes owed, and what happened in order, the run's end included. */
  owed: Array<OwedDelete>
  order: Array<string>
  /** Whether a delete's run holds the link. */
  inRun: { now: boolean }
  receipts: { reading: ReceiptsReading }
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
  const owed: Array<OwedDelete> = []
  const order: Array<string> = []
  const inRun = { now: false }
  const receipts: { reading: ReceiptsReading } = {
    reading: { kind: "unreachable" },
  }
  return {
    asked,
    letGo,
    reread,
    owed,
    order,
    inRun,
    receipts,
    ports: {
      deleteNotes: async (ids, settle): Promise<void> => {
        const answer = deferred<DeleteAsked>()
        asked.push({ ids, answer })
        const said = await answer.promise
        inRun.now = true
        try {
          await settle(said)
        } finally {
          inRun.now = false
          order.push("run ended")
        }
      },
      letGo: (_of, ids): Promise<boolean> => {
        order.push(inRun.now ? "let go in the run" : "let go after it")
        const done = deferred<boolean>()
        letGo.push({ ids, done })
        return done.promise
      },
      reread: (): void => {
        order.push(inRun.now ? "reread in the run" : "reread after it")
        reread.count += 1
      },
      owed: {
        list: () => [...owed],
        owe: (of, ids): boolean => {
          order.push("owed")
          owed.push(...ids.map((id) => ({ id, of })))
          return true
        },
        answered: (ids): void => {
          for (const id of ids) {
            const at = owed.findIndex((entry) => entry.id === id)
            if (at >= 0) owed.splice(at, 1)
          }
        },
      },
      askReceipts: () => Promise.resolve(receipts.reading),
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
    deleting.confirm()
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
      deleting.confirm()
      asked.at(-1)?.answer.resolve(answer)
      await flush()
      expect(deleting.getSnapshot().sheet.kind).toBe("ended")
    }
    expect(letGo).toEqual([])
    expect(reread.count).toBe(0)
  })

  it("still lets go after a stale let-go, which changes nothing on the sheet shown now", async () => {
    const { ports: p, asked, letGo } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1"])
    deleting.confirm()
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [{ id: "t1", answer: { status: 200, body: receipt("t1") } }],
    })
    await flush()
    // Done before this phone's copy has gone, then another take asked about.
    deleting.close()
    deleting.ask("studio", ["t2"])
    deleting.confirm()
    letGo[0]?.done.resolve(false)
    await flush()
    expect(deleting.getSnapshot().sheet).toEqual({
      kind: "deleting",
      of: "studio",
      ids: ["t2"],
    })
    expect(letGo.map((each) => each.ids)).toEqual([["t1"]])
  })

  it("asks again on Try again for what home didn't answer, and never for a final answer", async () => {
    const { ports: p, asked } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1", "t2"])
    deleting.confirm()
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [
        { id: "t1", answer: { status: 409, body: "{}" } },
        { id: "t2", answer: null },
      ],
    })
    await flush()
    deleting.confirm()
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
    deleting.confirm()
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [{ id: "t1", answer: { status: 200, body: receipt("t1") } }],
    })
    await flush()
    letGo[0]?.done.resolve(true)
    await flush()
    expect(order).toEqual([
      "owed",
      "let go in the run",
      "run ended",
      "reread after it",
    ])
  })

  it("reads My data again after a let-go that threw", async () => {
    const { ports: p, asked, reread } = ports()
    const deleting = createDeleting({
      ...p,
      letGo: () => Promise.reject(new Error("the store broke")),
    })
    deleting.ask("studio", ["t1"])
    deleting.confirm()
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [{ id: "t1", answer: { status: 200, body: receipt("t1") } }],
    })
    await flush()
    expect(reread.count).toBe(1)
  })

  it("owes each note before sending, and takes it off only on home's word for it", async () => {
    const { ports: p, asked, letGo, owed } = ports()
    const deleting = createDeleting(p)
    deleting.ask("studio", ["t1", "t2", "t3", "t4"])
    deleting.confirm()
    await flush()
    expect(owed.map((entry) => entry.id)).toEqual(["t1", "t2", "t3", "t4"])
    asked[0]?.answer.resolve({
      kind: "answered",
      answers: [
        { id: "t1", answer: { status: 200, body: receipt("t1") } },
        { id: "t2", answer: { status: 409, body: "{}" } },
        { id: "t3", answer: { status: 404, body: "{}" } },
        { id: "t4", answer: null },
      ],
    })
    await flush()
    letGo[0]?.done.resolve(true)
    await flush()
    expect(owed).toEqual([{ id: "t4", of: "studio" }])
  })

  it("sends nothing when the phone can't keep what it asks to delete", async () => {
    const { ports: p, asked } = ports()
    const deleting = createDeleting({
      ...p,
      owed: { ...p.owed, owe: () => false },
    })
    deleting.ask("studio", ["t1"])
    deleting.confirm()
    await flush()
    expect(asked).toEqual([])
    expect(deleting.getSnapshot().sheet).toMatchObject({
      kind: "ended",
      end: { kind: "busy" },
    })
  })

  it("settles, as My data opens, each owed note home's list says it deleted, sending no delete", async () => {
    const { ports: p, asked, letGo, owed, receipts, reread } = ports()
    owed.push({ id: "t1", of: "studio" }, { id: "t2", of: "studio" })
    receipts.reading = {
      kind: "read",
      receipts: [JSON.parse(receipt("t1")).receipt],
      total: 1,
    }
    const deleting = createDeleting(p)
    deleting.resume()
    await flush()
    expect(letGo.map((each) => each.ids)).toEqual([["t1"]])
    letGo[0]?.done.resolve(true)
    await flush()
    expect(owed).toEqual([{ id: "t2", of: "studio" }])
    expect(asked).toEqual([])
    expect(reread.count).toBe(1)
  })
})
