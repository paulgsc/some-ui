import { StrictMode, useEffect, useState } from "react"
import type { Decorator } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cn, useOrchestrator } from "some-ui-utils"

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

// Orchestrator wrapper - wire the singleton connection for Storybook

const OrchestratorWrapper = ({ children }: { children: React.ReactNode }) => {
  useOrchestrator({
    stream_id: "storybook",

    scenes: [], // Start with empty scenes (can be configured via CRM)

    orchestratorUrl: `ws://${window.location.hostname}:3000/ws`,

    onSceneChange: (from, to) => {
      console.log(`[Storybook] Scene changed: ${from} → ${to}`)
    },

    onError: (error) => {
      console.error(`[Storybook] Orchestrator error:`, error)
    },

    onStreamEnd: () => {
      console.log(`[Storybook] Stream ended`)
    },
  })

  // Don't block rendering on orchestrator connection

  // Components can check connection status via store if needed

  return <>{children}</>
}

// Inner component that uses the TTS hook (after QueryClient is provided)

export const withProviders: Decorator = (Story, context) => {
  const queryClient = createQueryClient()

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <OrchestratorWrapper>
          <Story {...context} />
        </OrchestratorWrapper>
      </QueryClientProvider>
    </StrictMode>
  )
}
