// @vitest-environment jsdom
import type { ReactElement, ReactNode } from "react"
import type { FetchClient } from "@fkit/lib/fetch-client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { createApiHooks } from "."

function fakeClient(): FetchClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    createQueryFn: vi.fn(),
    createMutationFn: vi.fn(),
  }
}

function makeWrapper(
  queryClient: QueryClient
): (props: { children: ReactNode }) => ReactElement {
  const Wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return Wrapper
}

const dataSchema = z.object({ id: z.number() })

describe("createQueryHook - param routing", () => {
  it("substitutes a param matching a :placeholder into the path, and appends the rest as query params", async () => {
    const client = fakeClient()
    vi.mocked(client.createQueryFn).mockReturnValue(() =>
      Promise.resolve({ id: 1 })
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const useItem = createApiHooks(client).createQueryHook(
      new URL("https://api.test/items/:id"),
      dataSchema
    )

    renderHook(() => useItem({ id: 42, verbose: "true" }), {
      wrapper: makeWrapper(queryClient),
    })

    await waitFor(() => expect(client.createQueryFn).toHaveBeenCalled())
    const [calledUrl] = vi.mocked(client.createQueryFn).mock.calls[0]!
    expect(calledUrl.pathname).toBe("/items/42")
    expect(calledUrl.searchParams.get("verbose")).toBe("true")
    // the placeholder param must not also leak through as a query param
    expect(calledUrl.searchParams.has("id")).toBe(false)
  })

  it("does not mutate the endpoint URL passed to the factory across repeated calls", () => {
    const client = fakeClient()
    vi.mocked(client.createQueryFn).mockReturnValue(() =>
      Promise.resolve({ id: 1 })
    )
    const endpoint = new URL("https://api.test/items/:id")
    const useItem = createApiHooks(client).createQueryHook(endpoint, dataSchema)

    renderHook(() => useItem({ id: 1 }), {
      wrapper: makeWrapper(
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      ),
    })
    renderHook(() => useItem({ id: 2 }), {
      wrapper: makeWrapper(
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      ),
    })

    expect(endpoint.pathname).toBe("/items/:id")
  })

  it("keys the cache on the raw params, so distinct path-param calls never collapse into one cache entry", async () => {
    const client = fakeClient()
    vi.mocked(client.createQueryFn).mockReturnValue(() =>
      Promise.resolve({ id: 1 })
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = makeWrapper(queryClient)
    const useItem = createApiHooks(client).createQueryHook(
      new URL("https://api.test/items/:id"),
      dataSchema
    )

    renderHook(() => useItem({ id: 1 }), { wrapper })
    renderHook(() => useItem({ id: 2 }), { wrapper })

    await waitFor(() => expect(client.createQueryFn).toHaveBeenCalledTimes(2))
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2)
  })
})

describe("createMutationHook - param routing", () => {
  it("substitutes a :placeholder param into the path", async () => {
    const client = fakeClient()
    vi.mocked(client.createMutationFn).mockReturnValue(() =>
      Promise.resolve({ id: 1 })
    )
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })

    const useUpdateItem = createApiHooks(client).createMutationHook(
      new URL("https://api.test/items/:id"),
      dataSchema
    )
    const { result } = renderHook(() => useUpdateItem({ id: 7 }), {
      wrapper: makeWrapper(queryClient),
    })

    act(() => {
      result.current.mutate({})
    })

    await waitFor(() => expect(client.createMutationFn).toHaveBeenCalled())
    const [calledUrl] = vi.mocked(client.createMutationFn).mock.calls[0]!
    expect(calledUrl.pathname).toBe("/items/7")
  })

  it("regression: unlike createQueryHook, a param with no matching :placeholder is silently dropped rather than appended as a query param", async () => {
    const client = fakeClient()
    vi.mocked(client.createMutationFn).mockReturnValue(() =>
      Promise.resolve({ id: 1 })
    )
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })

    const useUpdateItem = createApiHooks(client).createMutationHook(
      new URL("https://api.test/items/:id"),
      dataSchema
    )
    const { result } = renderHook(
      () => useUpdateItem({ id: 7, extra: "ignored" }),
      { wrapper: makeWrapper(queryClient) }
    )

    act(() => {
      result.current.mutate({})
    })

    await waitFor(() => expect(client.createMutationFn).toHaveBeenCalled())
    const [calledUrl] = vi.mocked(client.createMutationFn).mock.calls[0]!
    expect(calledUrl.pathname).toBe("/items/7")
    expect(calledUrl.search).toBe("")
  })
})
