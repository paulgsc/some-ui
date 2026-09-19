/**
 * @vitest-environment jsdom
 *
 * #946/S2: the layout autosave's `ambient-durable` migration. Two things
 * this producer needs that a plain `ambient` one doesn't (see
 * `presentation.ts`'s "autosave verdict" and `durable-failure.ts`'s
 * header): a failure has to remain visible while it's live, and it has to
 * still be visible after this hook's owning component unmounts and a
 * later mount picks the same session back up - the shape of "the person
 * edited the layout, it failed to save, and they left before noticing."
 *
 * Also covers the debounce's own thundering-herd guard on this write path:
 * several rapid edits must coalesce into one PATCH, not one per edit.
 */

import type { JSX, ReactNode } from "react"
import { matchIntent } from "@some-ui/intent-kit"
import type { ActiveLifetime } from "@some-ui/types"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SessionRecord } from "@/lib/tenant"

import { useLiveLayoutEditor } from "./use-live-layout-editor"

function withQueryClient(): {
  wrapper: (props: { children: ReactNode }) => JSX.Element
} {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  }
}

function fixtureSession(): SessionRecord {
  return {
    id: "session-durable-1",
    name: "Layout test",
    status: "active",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 60_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

const NO_LIFETIMES: Array<ActiveLifetime> = []

function stubPatch(options: { fail: boolean }): void {
  const impl: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    if (method === "PATCH") {
      if (options.fail) {
        return new Response(
          JSON.stringify({
            error: { code: "internal_error", message: "boom" },
          }),
          { status: 500 }
        )
      }
      const sessionId = url.split("/sessions/")[1]
      return new Response(
        JSON.stringify({ ...fixtureSession(), id: sessionId }),
        { status: 200 }
      )
    }
    // The incidental migration/list check every test here triggers just by
    // importing lib/tenant/hooks.ts - see session-composer.test.tsx's own
    // fetch stub for the same note.
    return Promise.reject(new TypeError("Failed to fetch"))
  }
  vi.stubGlobal("fetch", impl)
}

function autosaveSummary(
  state: ReturnType<typeof useLiveLayoutEditor>["autosaveStatus"]
): string | null {
  return matchIntent(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error) => error.summary,
  })
}

function autosaveRetryable(
  state: ReturnType<typeof useLiveLayoutEditor>["autosaveStatus"]
): boolean | null {
  return matchIntent(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error) => error.retryable,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("useLiveLayoutEditor: autosave durability", () => {
  it("a debounced autosave failure renders, and survives an unmount + remount of the same session", async () => {
    stubPatch({ fail: true })
    const { wrapper } = withQueryClient()
    const session = fixtureSession()

    const mounted = renderHook(
      () => useLiveLayoutEditor(session, NO_LIFETIMES),
      { wrapper }
    )

    act(() => {
      mounted.result.current.onTreeChange(mounted.result.current.tree)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    })

    expect(autosaveSummary(mounted.result.current.autosaveStatus)).toBeTruthy()

    mounted.unmount()

    const remounted = renderHook(
      () => useLiveLayoutEditor(session, NO_LIFETIMES),
      { wrapper }
    )

    const restoredSummary = autosaveSummary(
      remounted.result.current.autosaveStatus
    )
    expect(restoredSummary).toContain("didn't save")
    // No retry payload survives the unmount (see durable-failure.ts) - a
    // restored failure never offers a control that can't actually retry.
    expect(autosaveRetryable(remounted.result.current.autosaveStatus)).toBe(
      false
    )
  })

  it("a subsequent successful autosave clears the durable record for the next mount", async () => {
    stubPatch({ fail: true })
    const { wrapper } = withQueryClient()
    const session = fixtureSession()

    const first = renderHook(() => useLiveLayoutEditor(session, NO_LIFETIMES), {
      wrapper,
    })
    act(() => {
      first.result.current.onTreeChange(first.result.current.tree)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    })
    first.unmount()

    stubPatch({ fail: false })
    const second = renderHook(
      () => useLiveLayoutEditor(session, NO_LIFETIMES),
      { wrapper }
    )
    expect(autosaveSummary(second.result.current.autosaveStatus)).toContain(
      "didn't save"
    )

    act(() => {
      second.result.current.onTreeChange(second.result.current.tree)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    })
    second.unmount()

    const third = renderHook(() => useLiveLayoutEditor(session, NO_LIFETIMES), {
      wrapper,
    })
    expect(autosaveSummary(third.result.current.autosaveStatus)).toBeNull()
  })

  it("rapid consecutive edits coalesce into a single write, not one per edit", async () => {
    let patchCount = 0
    const impl: typeof fetch = async (input, init) => {
      const method = init?.method ?? "GET"
      if (method === "PATCH") {
        patchCount += 1
        const sessionId = String(input).split("/sessions/")[1]
        return new Response(
          JSON.stringify({ ...fixtureSession(), id: sessionId }),
          { status: 200 }
        )
      }
      return Promise.reject(new TypeError("Failed to fetch"))
    }
    vi.stubGlobal("fetch", impl)

    const { wrapper } = withQueryClient()
    const session = fixtureSession()
    const { result } = renderHook(
      () => useLiveLayoutEditor(session, NO_LIFETIMES),
      { wrapper }
    )

    // Three edits in the same debounce window, the same shape a resize
    // drag produces - the pre-existing debounce is the guard, and this is
    // the regression the migration must not quietly break.
    act(() => {
      result.current.onTreeChange(result.current.tree)
      result.current.onTreeChange(result.current.tree)
      result.current.onTreeChange(result.current.tree)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    })

    expect(patchCount).toBe(1)
  })
})
