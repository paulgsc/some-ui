import type { JSX, ReactNode } from "react"
import type { ConversationBatch, ITopikRepository } from "@chat/lib/topik"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useTopikBatchMetadata, useTopikCurrentBatch } from "."

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

function makeBatches(): Array<ConversationBatch> {
  return [
    {
      id: 0,
      messages: [
        {
          id: "m0",
          role: "assistant",
          content: "hi",
          timestamp: "t",
          korean: "안녕",
          english: "hi",
        },
        {
          id: "m1",
          role: "user",
          content: "hello",
          timestamp: "t",
          korean: "안녕하세요",
          english: "hello",
        },
      ],
      questions: [],
    },
    { id: 1, messages: [], questions: [] },
  ]
}

function makeRepository(batches: Array<ConversationBatch>): ITopikRepository {
  return { load: vi.fn().mockResolvedValue(batches) }
}

describe("useTopikBatchMetadata - select projection", () => {
  it("projects the batch at the given index down to its metadata counts", async () => {
    const batches = makeBatches()
    const repository = makeRepository(batches)
    const { result } = renderHook(
      () => useTopikBatchMetadata(repository, "k1", 0),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({
      id: 0,
      messageCount: 2,
      questionCount: 0,
    })
  })

  it("projects to null when the batch index is out of range", async () => {
    const repository = makeRepository(makeBatches())
    const { result } = renderHook(
      () => useTopikBatchMetadata(repository, "k1", 99),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})

describe("useTopikCurrentBatch - select projection", () => {
  it("projects to the batch at the given index", async () => {
    const batches = makeBatches()
    const repository = makeRepository(batches)
    const { result } = renderHook(
      () => useTopikCurrentBatch(repository, "k1", 1),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(batches[1])
  })

  it("projects to null when the batch index is out of range", async () => {
    const repository = makeRepository(makeBatches())
    const { result } = renderHook(
      () => useTopikCurrentBatch(repository, "k1", 99),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })
})
