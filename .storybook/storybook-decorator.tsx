import type { Decorator } from "@storybook/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// Create a fresh QueryClient for each story to avoid cache issues
const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: Infinity, // Changed from cacheTime to gcTime
      },
    },
  })

export const withReactQuery: Decorator = (Story) => {
  const queryClient = createQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  )
}
