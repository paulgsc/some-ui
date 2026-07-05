import type { JSX, ReactNode } from "react"
import type { ITopikMetadataRepository, TopikManifest } from "@chat/lib/topik"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  useTopikMetadata,
  useTopikMetadataList,
} from "."

function createWrapper(): ({
  children,
}: {
  children: ReactNode
}) => JSX.Element {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

function makeManifest(): TopikManifest {
  return {
    version: "1",
    topiks: [
      {
        key: "b",
        displayName: "Beta",
        description: "d",
        batchCount: 1,
        totalQuestions: 1,
        totalMessages: 1,
      },
      {
        key: "a",
        displayName: "Alpha",
        description: "d",
        batchCount: 1,
        totalQuestions: 1,
        totalMessages: 1,
      },
    ],
  }
}

function makeRepository(manifest: TopikManifest): ITopikMetadataRepository {
  return { loadCatalog: vi.fn().mockResolvedValue(manifest) }
}

describe("useTopikMetadataList - select projection", () => {
  it("sorts topiks by displayName", async () => {
    const repository = makeRepository(makeManifest())
    const { result } = renderHook(() => useTopikMetadataList(repository), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((t) => t.key)).toEqual(["a", "b"])
  })
})

describe("useTopikMetadata - select projection", () => {
  it("finds a topik by key", async () => {
    const repository = makeRepository(makeManifest())
    const { result } = renderHook(() => useTopikMetadata(repository, "a"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.displayName).toBe("Alpha")
  })

  it("resolves to undefined for an unknown key", async () => {
    const repository = makeRepository(makeManifest())
    const { result } = renderHook(
      () => useTopikMetadata(repository, "missing"),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
