import { StrictMode, useEffect, useState } from "react"
import type { Decorator } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cn,
  initializeSpeechQueue,
  useAudioTTS,
  useOrchestrator,
} from "some-ui-utils"

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

const TTSWrapper = ({ children }: { children: React.ReactNode }) => {
  const [isSpeechContextReady, setIsSpeechContextReady] = useState(false)

  const ttsHook = useAudioTTS({
    service: {
      provider: "openai",

      apiUrl: "http://nixos.local:5050/v1/audio/speech",

      apiKey: "your_dummy_api_key_here",

      format: "mp3",

      timeout: 30 * 1000, // 30 seconds
    },
    // Set the default voice to Sun-Hi for Korean
    voice: {
      id: "ko-KR-SunHiNeural",
      name: "Sun-Hi (Korean Female)",
      provider: "openai",
      language: "ko-KR",
      gender: "female",
    },
    autoPlay: true,
  })

  useEffect(() => {
    if (ttsHook.supported) {
      try {
        initializeSpeechQueue(ttsHook)

        console.log("Speech context initialized for Storybook")
      } catch (error) {
        console.log("Speech context already initialized or error:", error)
      } finally {
        setIsSpeechContextReady(true)
      }
    }
  }, [ttsHook.supported]) // Only depend on supported, not the entire hook

  if (!isSpeechContextReady) {
    const message = "Waiting for TTS Provider"

    // You can return a loading spinner, a placeholder, or null

    return (
      <div className={cn("flex items-center justify-center gap-3 p-4")}>
        <div
          className={cn("bg-primary/20 size-12 animate-pulse rounded-full")}
        ></div>

        <span className={cn("text-muted-foreground animate-pulse font-medium")}>
          {message}
        </span>
      </div>
    )
  }

  return <>{children}</>
}

export const withProviders: Decorator = (Story, context) => {
  const queryClient = createQueryClient()

  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <OrchestratorWrapper>
          <TTSWrapper>
            <Story {...context} />
          </TTSWrapper>
        </OrchestratorWrapper>
      </QueryClientProvider>
    </StrictMode>
  )
}
