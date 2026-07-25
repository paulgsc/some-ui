import fc from "fast-check"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MutationQueue } from "."

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function delayed<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function delayedReject(message: string, ms: number): Promise<never> {
  return new Promise((_resolve, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  )
}

describe("MutationQueue - FIFO ordering under reversed completion delays", () => {
  it("runs enqueued mutations in enqueue order even when later ones would resolve first", async () => {
    const queue = new MutationQueue()
    const order: Array<number> = []

    const p1 = queue.enqueue(async () => {
      await delayed(undefined, 30)
      order.push(1)
    })
    const p2 = queue.enqueue(async () => {
      await delayed(undefined, 10)
      order.push(2)
    })
    const p3 = queue.enqueue(async () => {
      await delayed(undefined, 20)
      order.push(3)
    })

    await vi.advanceTimersByTimeAsync(60)
    await Promise.all([p1, p2, p3])

    expect(order).toEqual([1, 2, 3])
  })
})

describe("MutationQueue - a rejected mutation does not break the chain", () => {
  it("still runs and resolves mutations enqueued after a failing one", async () => {
    const queue = new MutationQueue()
    const order: Array<string> = []

    const pFail = queue.enqueue(async () => {
      order.push("fail-start")
      await delayedReject("boom", 10)
    })
    const pOk = queue.enqueue(() => {
      order.push("ok")
      return "done"
    })

    await vi.advanceTimersByTimeAsync(10)

    await expect(pFail).rejects.toThrow("boom")
    await expect(pOk).resolves.toBe("done")
    expect(order).toEqual(["fail-start", "ok"])
  })
})

describe("MutationQueue - pendingMutations/isPending track in-flight work exactly", () => {
  it("reports pending while a mutation is in flight and returns to exactly zero once it settles", async () => {
    const queue = new MutationQueue()
    expect(queue.isPending).toBe(false)
    expect(queue.pendingMutations).toBe(0)

    const p = queue.enqueue(() => delayed("x", 10))
    expect(queue.isPending).toBe(true)
    expect(queue.pendingMutations).toBe(1)

    await vi.advanceTimersByTimeAsync(10)
    await p

    expect(queue.isPending).toBe(false)
    expect(queue.pendingMutations).toBe(0)
  })

  it("regression: pendingMutations returns to zero (not negative) after a failing mutation settles", async () => {
    // Guards against a double-decrement: enqueue() increments pendingCount
    // once per call, so it must come back down by exactly one per settled
    // mutation regardless of whether that mutation resolved or rejected.
    const queue = new MutationQueue()

    const p = queue.enqueue(() => delayedReject("boom", 10))
    await vi.advanceTimersByTimeAsync(10)
    await expect(p).rejects.toThrow("boom")

    expect(queue.pendingMutations).toBe(0)
    expect(queue.isPending).toBe(false)
  })

  it("property: pendingMutations always returns to exactly zero after any mix of succeeding/failing mutations settles", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), { minLength: 0, maxLength: 15 }),
        async (shouldFailFlags) => {
          vi.useRealTimers()
          const queue = new MutationQueue()

          const settled = shouldFailFlags.map((shouldFail) =>
            queue
              .enqueue(() => {
                if (shouldFail) throw new Error("boom")
                return "ok"
              })
              .catch(() => {
                // only draining the rejection here - the queue's own
                // bookkeeping is what's under test, not error propagation
              })
          )

          await Promise.all(settled)

          expect(queue.pendingMutations).toBe(0)
          expect(queue.isPending).toBe(false)

          vi.useFakeTimers()
        }
      ),
      { numRuns: 25 }
    )
  })
})

describe("MutationQueue - flush waits for all currently queued mutations", () => {
  it("does not resolve until an in-flight mutation settles", async () => {
    const queue = new MutationQueue()
    let ran = false

    queue.enqueue(async () => {
      await delayed(undefined, 20)
      ran = true
    })

    const flushed = queue.flush()
    let flushResolved = false
    void flushed.then(() => {
      flushResolved = true
    })

    await vi.advanceTimersByTimeAsync(5)
    expect(flushResolved).toBe(false)
    expect(ran).toBe(false)

    await vi.advanceTimersByTimeAsync(20)
    await flushed

    expect(ran).toBe(true)
  })
})

describe("MutationQueue - clear", () => {
  it("resets the queue tail without cancelling or awaiting in-flight work", async () => {
    const queue = new MutationQueue()
    const order: Array<string> = []

    queue.enqueue(async () => {
      await delayed(undefined, 20)
      order.push("first")
    })

    queue.clear()

    const p2 = queue.enqueue(() => {
      order.push("second")
    })

    // "second" was enqueued onto a cleared (already-resolved) queue tail, so
    // it can run immediately rather than waiting on "first".
    await p2
    expect(order).toEqual(["second"])

    await vi.advanceTimersByTimeAsync(20)
    expect(order).toEqual(["second", "first"])
  })
})
