/**
 * A `file_host` timeout gets no further attempts (retrying multiplies the
 * `client.ts` deadline); every other `file_host` failure still gets 3.
 */

import { queryClient } from "@/providers/tanstack-query"
import { describe, expect, it } from "vitest"

import { FileHostUnreachableError } from "@/lib/file-host-config"

function retryFn(): (failureCount: number, error: Error) => boolean {
  const { retry } = queryClient.getDefaultOptions().queries ?? {}
  if (typeof retry !== "function") {
    throw new Error(
      "expected queries.retry to be a function - this test would otherwise silently pass against a stale `retry: 3`"
    )
  }
  return retry
}

describe("queryClient default retry policy", () => {
  it("does not retry a file_host timeout at all", () => {
    const retry = retryFn()
    const timeout = new FileHostUnreachableError(
      "sessions",
      new DOMException(
        "file_host did not answer sessions within the deadline",
        "TimeoutError"
      )
    )

    expect(retry(0, timeout)).toBe(false)
    expect(retry(1, timeout)).toBe(false)
    expect(retry(2, timeout)).toBe(false)
  })

  it("still retries a non-timeout file_host failure up to 3 times", () => {
    const retry = retryFn()
    const connectionRefused = new FileHostUnreachableError(
      "sessions",
      new TypeError("Failed to fetch")
    )

    expect(retry(0, connectionRefused)).toBe(true)
    expect(retry(1, connectionRefused)).toBe(true)
    expect(retry(2, connectionRefused)).toBe(true)
    expect(retry(3, connectionRefused)).toBe(false)
  })

  it("still retries a plain, non-file_host error up to 3 times (unrelated failures keep their existing behavior)", () => {
    const retry = retryFn()
    const somethingElse = new Error("unrelated")

    expect(retry(0, somethingElse)).toBe(true)
    expect(retry(2, somethingElse)).toBe(true)
    expect(retry(3, somethingElse)).toBe(false)
  })
})
