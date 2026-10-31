import type { JSX, ReactNode } from "react"
import type { ActivityHost } from "@some-ui/react-hooks"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { SessionConfigProvider } from "@topik/lib/topik/adapter/context/session-config-context"
import { useKoreanStudyPageVM } from "@topik/lib/topik/adapter/hooks/use-korean-study-page-vm"
import type { ConversationBatch } from "@topik/lib/topik/entity/topik-types"
import { describe, expect, it } from "vitest"

const BATCH: ConversationBatch = {
  id: 0,
  messages: [0, 1, 2].map((i) => ({
    id: `m${i}`,
    role: i % 2 === 0 ? "assistant" : "user",
    content: `message ${i}`,
    timestamp: new Date(2024, 0, 1, 0, 0, i).toISOString(),
    korean: `한국어 ${i}`,
    english: `english ${i}`,
  })),
  questions: [],
}

/** A host whose hold a test moves by hand. */
function fakeHost(): ActivityHost & { set: (held: boolean) => void } {
  let held = false
  const listeners = new Set<() => void>()
  return {
    held: () => held,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    recall: () => undefined,
    keep: () => undefined,
    set: (next): void => {
      held = next
      listeners.forEach((listener) => listener())
    },
  }
}

describe("useKoreanStudyPageVM inside a session (SS2)", () => {
  it("pauses the conversation while the session waits, and plays it on after", async () => {
    const host = fakeHost()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
      <QueryClientProvider client={client}>
        <SessionConfigProvider
          value={{
            topikRepository: { load: () => Promise.resolve([BATCH]) },
            metadataRepository: {
              loadCatalog: () => Promise.resolve({ version: "1", topiks: [] }),
            },
            speaker: null,
            host,
          }}
        >
          {children}
        </SessionConfigProvider>
      </QueryClientProvider>
    )
    const { result } = renderHook(() => useKoreanStudyPageVM(), { wrapper })

    act(() => result.current.header.onTopikSelect("t1"))
    await waitFor(() => expect(result.current.chat.playState).toBe("running"))

    act(() => host.set(true))
    expect(result.current.chat.playState).toBe("paused")
    // Play pressed while the session waits plays once it is back.
    act(() => result.current.actions.startChat())
    expect(result.current.chat.playState).toBe("paused")

    act(() => host.set(false))
    expect(result.current.chat.playState).toBe("running")
  })
})
