import { StrictMode } from "react"
import type { Decorator } from "@storybook/react-vite"
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

export const withProviders: Decorator = (Story, context) => {
  const queryClient = createQueryClient()

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Story {...context} />
      </QueryClientProvider>
    </StrictMode>
  )
}
