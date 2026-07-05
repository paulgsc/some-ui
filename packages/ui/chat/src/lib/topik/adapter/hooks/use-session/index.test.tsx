import type { JSX, ReactNode } from "react"
import { StrictMode } from "react"
import type {
  ITopikMetadataRepository,
  ITopikRepository,
  TopikManifestFile,
} from "@chat/lib/topik"
import { actions } from "@chat/lib/topik"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { UseAudioTTSReturn } from "some-ui-utils"
import { describe, expect, it, vi } from "vitest"

import { useSession } from "."
import type { UseEnhancedSessionConfig } from "."

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
//
// use-session.ts:91 (`if (!machineRef.current) machineRef.current = ...`)
// and :106 hold V6 - "the machine lives outside React, keyed by a ref, and
// must survive re-renders without being recreated." The README's own
// "V6: Survives remount" test (never actually written as a file) is the
// scenario these tests cover: dispatched state and the machine's identity
// must not reset just because the component re-renders - including under
// React 18 StrictMode's double render.
// ═══════════════════════════════════════════════════════════════════════════

function createWrapper(
  queryClient: QueryClient
): ({ children }: { children: ReactNode }) => JSX.Element {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

function createStrictWrapper(
  queryClient: QueryClient
): ({ children }: { children: ReactNode }) => JSX.Element {
  const StrictWrapper = ({
    children,
  }: {
    children: ReactNode
  }): JSX.Element => (
    <StrictMode>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </StrictMode>
  )
  return StrictWrapper
}

/**
 * `enableTTS: false` keeps the executor from ever touching `audioTTS`, so an
 * empty placeholder that satisfies the type is enough here.
 */
function fakeAudioTTS(): UseAudioTTSReturn {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see comment above
  return {} as UseAudioTTSReturn
}

function makeConfig(
  overrides: Partial<UseEnhancedSessionConfig> = {}
): UseEnhancedSessionConfig {
  const manifest: TopikManifestFile = { version: "1", topiks: [] }
  const repository: ITopikRepository = { load: vi.fn().mockResolvedValue([]) }
  const metadataRepository: ITopikMetadataRepository = {
    loadCatalog: vi.fn().mockResolvedValue(manifest),
  }

  return {
    repository,
    metadataRepository,
    audioTTS: fakeAudioTTS(),
    componentId: "c1",
    enableTTS: false,
    ...overrides,
  }
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/**
 * Drains the pending catalog/topik-fetch microtasks (kicked off by effects
 * we don't otherwise await) inside `act` so React doesn't warn about a
 * state update happening outside of it once those promises settle.
 */
async function flushPendingEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("useSession - V6 remount stability", () => {
  it("keeps the same machine instance and dispatched state across a parent re-render", async () => {
    const config = makeConfig()
    const { result, rerender } = renderHook(() => useSession(config), {
      wrapper: createWrapper(newQueryClient()),
    })

    const machineBefore = result.current.machine

    act(() => {
      result.current.dispatch(actions.selectTopik("topik-1"))
    })
    expect(result.current.state.phase).toBe("hydrating")
    const stateBefore = result.current.state

    rerender()

    expect(result.current.machine).toBe(machineBefore)
    expect(result.current.state).toBe(stateBefore)

    await flushPendingEffects()
  })

  it("does not create a second machine when React StrictMode double-invokes render", async () => {
    const config = makeConfig()
    const { result } = renderHook(() => useSession(config), {
      wrapper: createStrictWrapper(newQueryClient()),
    })

    act(() => {
      result.current.dispatch(actions.selectTopik("topik-1"))
    })

    // If StrictMode's double-invocation of the component function created a
    // second SessionMachine, `machine.getState()` (read from whichever
    // instance survived) would disagree with `state` (the React state that
    // was updated by the subscription on the OTHER instance).
    expect(result.current.state.phase).toBe("hydrating")
    expect(result.current.machine.getState()).toBe(result.current.state)

    await flushPendingEffects()
  })

  it("keeps dispatching against the same machine across re-renders with fresh callback identities", async () => {
    const config = makeConfig()
    const { result, rerender } = renderHook(
      (props: UseEnhancedSessionConfig) => useSession(props),
      { wrapper: createWrapper(newQueryClient()), initialProps: config }
    )

    act(() => {
      result.current.dispatch(actions.selectTopik("topik-1"))
    })
    expect(result.current.state.phase).toBe("hydrating")
    const machineBefore = result.current.machine

    // Real-world consumers often pass a brand-new inline callback on every
    // render. That must not tear down and recreate the machine/executor.
    for (let i = 0; i < 3; i++) {
      rerender({ ...config, onBatchComplete: () => {} })
    }

    expect(result.current.machine).toBe(machineBefore)
    expect(result.current.state.phase).toBe("hydrating")

    act(() => {
      result.current.dispatch(actions.changeTopik())
    })
    expect(result.current.state.phase).toBe("selecting")

    await flushPendingEffects()
  })
})
