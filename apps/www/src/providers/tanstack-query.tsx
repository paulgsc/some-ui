import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { onAccountChange } from "@/lib/auth"
import { isFileHostTimeout } from "@/lib/file-host-config/client"

const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        // A timeout gets no further attempts (retrying multiplies the
        // `file-host-config/client.ts` deadline); other failures get 3.
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
 * The singleton client, exported because the router carries it in context:
 * route loaders prefetch into this exact cache.
 */
export const queryClient = createQueryClient()

// Per-person reads share keys across accounts and stay fresh for 15 minutes,
// so a session ending clears the cache. Signing in is a full page load
// (`enterAccount`), so no in-flight mutation writes back after this clear.
onAccountChange(() => queryClient.clear())

export const QueryProvider = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
