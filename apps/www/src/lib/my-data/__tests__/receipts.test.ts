/**
 * @vitest-environment node
 *
 * My data's Deleted page's read (MD3, #2477): an answer to an earlier read
 * changes nothing, and a read again keeps what was shown until it lands.
 */
import { describe, expect, it } from "vitest"

import type { ReceiptsReading } from "@/lib/my-data/deleting"
import { createReceipts } from "@/lib/my-data/receipts"

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

describe("the Deleted page's read", () => {
  it("drops an earlier read's late answer, and keeps what was shown meanwhile", async () => {
    const answers: Array<Deferred<ReceiptsReading>> = []
    const receipts = createReceipts({
      askHome: (): Promise<ReceiptsReading> => {
        const answer = deferred<ReceiptsReading>()
        answers.push(answer)
        return answer.promise
      },
    })
    receipts.open()
    answers[0]?.resolve({ kind: "read", receipts: [], total: 0 })
    await flush()
    expect(receipts.getSnapshot().reading).toEqual({
      kind: "read",
      receipts: [],
      total: 0,
    })
    receipts.open()
    const pulled = receipts.checkAgain()
    expect(receipts.getSnapshot().reading.kind).toBe("read")
    answers[2]?.resolve({ kind: "unreachable" })
    await expect(pulled).rejects.toThrow()
    // The earlier read's answer, landing last, is not the page's.
    answers[1]?.resolve({ kind: "older" })
    await flush()
    expect(receipts.getSnapshot().reading).toEqual({ kind: "unreachable" })
  })
})
