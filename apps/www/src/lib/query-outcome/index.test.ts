/**
 * QO1: "Try again" on a read joins the request already on its way; at most
 * one request per read is running.
 *
 * Against a query function that answers only when the test says, and that
 * ignores its `signal`, as the tenant query functions (`lib/tenant/queries`)
 * do: a cancel there ends nothing, so a retry that cancelled and refetched
 * left the first GET running beside the second.
 */

import { createTestQueryClient } from "@/test-support/query-client"
import { toIntentError } from "@some-ui/intent-kit"
import { QueryObserver } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"

import { queryOutcome } from "@/lib/query-outcome"

/**
 * `tap`: "Try again", wherever the outcome offers it. `answer`/`fail`: the
 * requests on their way settle. `refresh`: a background refetch, as a
 * remount with `refetchOnMount: true` starts one (it joins, as a mount does).
 */
type Step = "tap" | "answer" | "fail" | "refresh"
const STEPS: ReadonlyArray<Step> = ["tap", "answer", "fail", "refresh"]

/** Every run of `steps` up to `length` long. */
function runs(length: number): Array<Array<Step>> {
  if (length === 0) return [[]]
  const shorter = runs(length - 1)
  return [
    ...shorter,
    ...shorter
      .filter((run) => run.length === length - 1)
      .flatMap((run) => STEPS.map((next) => [...run, next])),
  ]
}

/** Lets every settled request reach the observer, without a timer's delay. */
const flush = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

/** A read whose every request waits on the test, and never sees a cancel. */
function pendingRead(): {
  readonly queryFn: () => Promise<string>
  readonly started: () => number
  readonly running: () => number
  readonly settle: (ok: boolean) => void
} {
  const waiting: Array<{ ok: () => void; fail: () => void }> = []
  let started = 0
  return {
    queryFn: () =>
      new Promise<string>((resolve, reject) => {
        started += 1
        waiting.push({
          ok: () => resolve(`read ${started}`),
          fail: () => reject(new Error("offline")),
        })
      }),
    started: () => started,
    running: () => waiting.length,
    settle: (ok): void => {
      for (const request of waiting.splice(0)) {
        if (ok) request.ok()
        else request.fail()
      }
    },
  }
}

describe("QO1: a retry while a read is on its way joins it", () => {
  it("for every run of taps, answers, failures and refreshes (up to 5 steps), a tap starts a request only when none is running, and at most one runs", async () => {
    for (const run of runs(5)) {
      const client = createTestQueryClient()
      const read = pendingRead()
      const observer = new QueryObserver(client, {
        queryKey: ["qo1"],
        queryFn: read.queryFn,
      })
      const unsubscribe = observer.subscribe(() => undefined)
      await flush()

      for (const next of run) {
        if (next === "tap") {
          const before = read.started()
          const wasRunning = read.running() > 0
          const outcome = queryOutcome(
            observer.getCurrentResult(),
            toIntentError
          )
          // "Try again" is shown only where the outcome offers a retry.
          const retry =
            outcome.status === "failed"
              ? outcome.retry
              : outcome.status === "ready"
                ? outcome.refreshError?.retry
                : undefined
          retry?.()
          await flush()
          // A tap joins a request on its way, and starts one only when none is.
          const expected = wasRunning || !retry ? before : before + 1
          expect(read.started(), run.join(",")).toBe(expected)
        } else if (next === "refresh") {
          void observer.refetch({ cancelRefetch: false })
          await flush()
        } else {
          read.settle(next === "answer")
          await flush()
        }
        expect(read.running(), run.join(",")).toBeLessThanOrEqual(1)
      }

      unsubscribe()
      client.clear()
    }
  })
})
