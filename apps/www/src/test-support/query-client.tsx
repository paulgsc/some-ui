/**
 * A `QueryClient` for tests: no retries, so a failure settles at once, and a
 * fresh cache per call, so nothing leaks between tests.
 */
import type { JSX, ReactNode } from "react"
import type {
  QueryObserverBaseResult,
  UseQueryResult,
} from "@tanstack/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** `node` under a `QueryClientProvider` (a fresh test client by default). */
export function withQueryClient(
  node: ReactNode,
  client: QueryClient = createTestQueryClient()
): JSX.Element {
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

/** A `wrapper` for `render`/`renderHook`, sharing one client across renders. */
export function queryClientWrapper(
  client: QueryClient = createTestQueryClient()
): (props: { children: ReactNode }) => JSX.Element {
  return ({ children }) => withQueryClient(children, client)
}

/**
 * A stubbed `UseQueryResult` with only the fields `queryOutcome()` reads; the
 * real shape has no minimal constructor.
 */
export function fakeQueryResult<T>(
  fields: Partial<QueryObserverBaseResult<T>>
): UseQueryResult<T> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- stubbing TanStack Query's rich UseQueryResult with only the fields queryOutcome() reads
  return fields as UseQueryResult<T>
}

/** A settled query holding `data`, whose latest background refresh failed or not. */
export function cachedQueryResult<T>(
  data: T,
  refreshFailed: boolean,
  extra: Partial<QueryObserverBaseResult<T>> = {}
): UseQueryResult<T> {
  return fakeQueryResult<T>({
    data,
    isLoading: false,
    isError: refreshFailed,
    error: refreshFailed ? new Error("refresh failed") : null,
    ...extra,
  })
}

/** A first read still in flight: no data, not errored. */
export function pendingQueryResult<T>(
  extra: Partial<QueryObserverBaseResult<T>> = {}
): UseQueryResult<T> {
  return fakeQueryResult<T>({
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
    ...extra,
  })
}

/** A first read that failed: no data, errored. */
export function failedQueryResult<T>(
  extra: Partial<QueryObserverBaseResult<T>> = {}
): UseQueryResult<T> {
  return fakeQueryResult<T>({
    data: undefined,
    isLoading: false,
    isError: true,
    error: new Error("boom"),
    ...extra,
  })
}
