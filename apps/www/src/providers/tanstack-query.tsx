import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: 3,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

// Create a singleton instance to avoid recreating on re-renders
const queryClient = createQueryClient()

export const QueryProvider = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
