/**
 * @vitest-environment jsdom
 *
 * Proof of IR1 (`../report.ts`).
 */

import { queryClientWrapper } from "@/test-support/query-client"
import type { ForeignFailure } from "@some-ui/intent-kit"
import { addFailureSink, matchIntent } from "@some-ui/intent-kit"
import { useMutation } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { unprocessable } from "@/lib/device-backend/router"
import { requestJSON } from "@/lib/file-host-config/client"
import { ForeignCallError } from "@/lib/intent/foreign"
import { useAsyncIntent } from "@/lib/intent/use-async-intent"
import { useIntent } from "@/lib/intent/use-intent"
import { failureLine } from "@/lib/native-log"

let reported: Array<ForeignFailure> = []
let removeSink: () => void = () => undefined

beforeEach(() => {
  reported = []
  removeSink = addFailureSink((failure) => reported.push(failure))
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  removeSink()
  vi.restoreAllMocks()
})

/** The phone's backend refusing a create, as it did on 2026-10-30. */
const refusedCreate = (): Promise<unknown> =>
  requestJSON(
    () =>
      Promise.resolve(
        unprocessable({
          id: ["is session- and 16 to 56 letters, digits, - and _"],
        })
      ),
    "/sessions",
    { method: "POST", body: "{}" }
  )

it("logs a refused request once, with its route, status, code and reason", async () => {
  const { result, rerender } = renderHook(
    () =>
      useIntent(useMutation({ mutationFn: refusedCreate }), {
        presentation: "interactive",
      }),
    { wrapper: queryClientWrapper() }
  )
  act(() => {
    result.current.start(undefined)
  })
  await waitFor(() => expect(reported).toHaveLength(1))
  rerender()

  expect(reported).toHaveLength(1)
  const line = failureLine(reported[0])
  expect(line).toContain(
    "[intent] rejected: That request couldn't be completed."
  )
  expect(line).toContain("422 for POST /sessions (unprocessable_entity)")
  expect(line).toContain("is session- and 16 to 56 letters")
})

it("logs each failure again when a retry fails again", async () => {
  const { result } = renderHook(
    () =>
      useIntent(useMutation({ mutationFn: refusedCreate }), {
        presentation: "interactive",
      }),
    { wrapper: queryClientWrapper() }
  )
  act(() => {
    result.current.start(undefined)
  })
  await waitFor(() => expect(reported).toHaveLength(1))
  act(() => {
    result.current.start(undefined)
  })
  await waitFor(() => expect(reported).toHaveLength(2))
})

it("logs what a non-mutation intent shows, too", async () => {
  const { result } = renderHook(() =>
    useAsyncIntent(refusedCreate, { presentation: "interactive" })
  )
  act(() => {
    result.current.start(undefined)
  })
  await waitFor(() => expect(reported).toHaveLength(1))
})

it("leaves a foreign call's failure to callForeign, which already logged it", async () => {
  const { result } = renderHook(() =>
    useAsyncIntent(
      () =>
        Promise.reject(
          new ForeignCallError({
            kind: "unavailable",
            retryable: false,
            summary: "Sharing isn't available here.",
            cause: null,
          })
        ),
      { presentation: "interactive" }
    )
  )
  act(() => {
    result.current.start(undefined)
  })
  await waitFor(() =>
    expect(
      matchIntent(result.current.state, {
        idle: () => "idle",
        working: () => "working",
        succeeded: () => "succeeded",
        failed: () => "failed",
      })
    ).toBe("failed")
  )
  expect(reported).toEqual([])
})
