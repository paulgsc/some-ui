/**
 * @vitest-environment jsdom
 *
 * The phone's kept record of what went wrong: each reported failure, as the
 * native log's line with when, newest first, the newest `FAILURE_LOG_CAP`.
 */
import type { ForeignFailure } from "@some-ui/intent-kit"
import { reportFailure } from "@some-ui/intent-kit"
import { afterEach, expect, it, vi } from "vitest"

import {
  FAILURE_LOG_CAP,
  failureLogSnapshot,
  installFailureLog,
  keepFailure,
  subscribeFailureLog,
} from "@/lib/failure-log"
import { failureLine } from "@/lib/native-log"

const failure = (summary: string): ForeignFailure => ({
  port: "intent",
  error: {
    kind: "rejected",
    retryable: false,
    summary,
    cause: new Error("file_host answered 422 for POST /sessions"),
  },
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

it("keeps the native log's line with when, newest first, up to its cap", () => {
  for (let i = 0; i <= FAILURE_LOG_CAP; i += 1) {
    keepFailure(failure(`number ${i}`), new Date(Date.UTC(2026, 9, 30, 0, i)))
  }
  const kept = failureLogSnapshot()
  expect(kept).toHaveLength(FAILURE_LOG_CAP)
  expect(kept[0]).toEqual({
    at: new Date(Date.UTC(2026, 9, 30, 0, FAILURE_LOG_CAP)).toISOString(),
    line: failureLine(failure(`number ${FAILURE_LOG_CAP}`)),
  })
  expect(kept.at(-1)?.line).toContain("rejected: number 1 ")
})

it("keeps every reported failure once installed, and says so to a reader", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  const heard = vi.fn()
  const stop = subscribeFailureLog(heard)
  const before = failureLogSnapshot()
  expect(failureLogSnapshot()).toBe(before)

  installFailureLog()
  installFailureLog()
  reportFailure(failure("Pick a portion"))
  stop()

  expect(heard).toHaveBeenCalledTimes(1)
  expect(failureLogSnapshot()).not.toBe(before)
  expect(failureLogSnapshot().map((entry) => entry.line)).toEqual([
    expect.stringContaining("rejected: Pick a portion"),
  ])
})
