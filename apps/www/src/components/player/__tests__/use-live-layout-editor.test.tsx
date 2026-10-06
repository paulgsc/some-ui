/**
 * @vitest-environment jsdom
 *
 * The layout autosave as `ambient-durable` (`presentation.ts`,
 * `durable-failure.ts`): a failure stays visible while live, and still after
 * the owning component unmounts and a later mount picks the session back up.
 * Also: rapid edits coalesce into one PATCH.
 */

import { queryClientWrapper } from "@/test-support/query-client"
import { sessionRecord } from "@/test-support/session-record"
import { signInForTests } from "@/test-support/sign-in"
import { matchIntent } from "@some-ui/intent-kit"
import type { ActiveLifetime } from "@some-ui/types"
import type { RenderHookResult } from "@testing-library/react"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useLiveLayoutEditor } from "@/components/player/use-live-layout-editor"

// These suites are about the account's store failing: start from an account.
beforeEach(() => {
  signInForTests()
})

const SESSION = sessionRecord({
  id: "session-durable-1",
  name: "Layout test",
  status: "active",
  totalDurationMs: 60_000,
})

const NO_LIFETIMES: Array<ActiveLifetime> = []

/** Answers PATCH (failing, or echoing the session); rejects everything else,
 * such as the incidental list read `lib/tenant/hooks.ts` triggers. */
function stubPatch(options: { fail: boolean; onPatch?: () => void }): void {
  const impl: typeof fetch = async (input, init) => {
    if ((init?.method ?? "GET") !== "PATCH") {
      return Promise.reject(new TypeError("Failed to fetch"))
    }
    options.onPatch?.()
    if (options.fail) {
      return new Response(
        JSON.stringify({ error: { code: "internal_error", message: "boom" } }),
        { status: 500 }
      )
    }
    const sessionId = String(input).split("/sessions/")[1]
    return new Response(JSON.stringify({ ...SESSION, id: sessionId }), {
      status: 200,
    })
  }
  vi.stubGlobal("fetch", impl)
}

type Editor = ReturnType<typeof useLiveLayoutEditor>

function autosaveSummary(state: Editor["autosaveStatus"]): string | null {
  return matchIntent(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error) => error.summary,
  })
}

function autosaveRetryable(state: Editor["autosaveStatus"]): boolean | null {
  return matchIntent(state, {
    idle: () => null,
    working: () => null,
    succeeded: () => null,
    failed: (error) => error.retryable,
  })
}

const settle = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500))
  })

/** Edits the tree `times` times in one debounce window and lets it flush. */
async function edit(result: { current: Editor }, times = 1): Promise<void> {
  act(() => {
    for (let i = 0; i < times; i += 1) {
      result.current.onTreeChange(result.current.tree)
    }
  })
  await settle()
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe("useLiveLayoutEditor: autosave durability", () => {
  const mount = (
    wrapper: ReturnType<typeof queryClientWrapper>
  ): RenderHookResult<Editor, unknown> =>
    renderHook(() => useLiveLayoutEditor(SESSION, NO_LIFETIMES), { wrapper })

  it("a debounced autosave failure renders, and survives an unmount + remount of the same session", async () => {
    stubPatch({ fail: true })
    const wrapper = queryClientWrapper()

    const mounted = mount(wrapper)
    await edit(mounted.result)

    expect(autosaveSummary(mounted.result.current.autosaveStatus)).toBeTruthy()

    mounted.unmount()
    const remounted = mount(wrapper)

    expect(autosaveSummary(remounted.result.current.autosaveStatus)).toContain(
      "didn't save"
    )
    // No retry payload survives the unmount, so no retry control is offered.
    expect(autosaveRetryable(remounted.result.current.autosaveStatus)).toBe(
      false
    )
  })

  it("a subsequent successful autosave clears the durable record for the next mount", async () => {
    stubPatch({ fail: true })
    const wrapper = queryClientWrapper()

    const first = mount(wrapper)
    await edit(first.result)
    first.unmount()

    stubPatch({ fail: false })
    const second = mount(wrapper)
    expect(autosaveSummary(second.result.current.autosaveStatus)).toContain(
      "didn't save"
    )
    await edit(second.result)
    second.unmount()

    const third = mount(wrapper)
    expect(autosaveSummary(third.result.current.autosaveStatus)).toBeNull()
  })

  it("rapid consecutive edits coalesce into a single write, not one per edit", async () => {
    let patchCount = 0
    stubPatch({ fail: false, onPatch: () => (patchCount += 1) })

    const { result } = mount(queryClientWrapper())
    // Three edits in one debounce window, as a resize drag produces.
    await edit(result, 3)

    expect(patchCount).toBe(1)
  })
})
