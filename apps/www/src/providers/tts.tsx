import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { cn, initializeSpeechQueue, useAudioTTS } from "some-ui-utils"

export const TTSProvider = ({ children }: { children: ReactNode }) => {
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
        initializeSpeechQueue(ttsHook)
        console.log("Speech context initialized")
      } catch (error) {
        console.log("Speech context already initialized or error:", error)
      } finally {
        setIsSpeechContextReady(true)
      }
    }
  }, [ttsHook.supported])

  if (!isSpeechContextReady) {
    return (
      <div className={cn("flex items-center justify-center gap-3 p-4")}>
        <div
          className={cn("bg-primary/20 size-12 animate-pulse rounded-full")}
        />
        <span className={cn("text-muted-foreground animate-pulse font-medium")}>
          Initializing TTS Provider...
        </span>
      </div>
    )
  }

  return <>{children}</>
}
