import { useEffect, useState } from "react"
import type { Decorator } from "@storybook/react-vite"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cn, initializeSpeechContext, useAudioTTS } from "some-ui-utils"

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
    autoPlay: true,
  })

  useEffect(() => {
    if (ttsHook.supported) {
      try {
        initializeSpeechContext(ttsHook)
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
    <QueryClientProvider client={queryClient}>
      <TTSWrapper>
        <Story {...context} />
      </TTSWrapper>
    </QueryClientProvider>
  )
}
