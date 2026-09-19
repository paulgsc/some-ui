import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { isFileHostTimeout } from "@/lib/file-host-config/client"

const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        // A plain `3` retries a `file_host` deadline exactly as eagerly as a
        // fast rejection, which turns one 10s timeout into roughly four
        // (plus backoff) before a route's read settles - the opposite of
        // the bounded wait `file-host-config/client.ts`'s deadline exists
        // to give. A timeout gets zero further attempts; every other
        // failure (connection refused, a 5xx) still gets the usual 3.
        retry: (failureCount, error) =>
          failureCount < 3 && !isFileHostTimeout(error),
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

/**
 * Create a singleton instance to avoid recreating on re-renders.
 *
 * Exported because the router carries it in its context: route loaders
 * prefetch into this exact cache, and the components that later read it do so
 * through `QueryClientProvider` below. Two clients would mean a loader
 * warming a cache nobody reads.
 */
export const queryClient = createQueryClient()

export const QueryProvider = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
