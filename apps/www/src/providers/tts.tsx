import type { JSX, ReactNode } from "react"
import { useEffect, useState } from "react"
import { cn, initializeSpeechQueue, useAudioTTS } from "some-ui-utils"
import type { TTSProvider as TTSProviderId } from "some-ui-utils"

import { useSettings } from "@/lib/tenant"

type TTSSessionProps = {
  children: ReactNode
  provider: TTSProviderId
  voiceId: string
}

/**
 * useAudioTTS snapshots its config once on mount (it doesn't react to
 * prop changes internally), so switching providers needs a fresh instance -
 * TTSProvider below remounts this by keying on `provider`. Voice-only
 * changes don't need a remount; they're applied via setSelectedVoice.
 */
const TTSSession = ({
  children,
  provider,
  voiceId,
}: TTSSessionProps): JSX.Element => {
  const [isSpeechContextReady, setIsSpeechContextReady] = useState(false)

  const ttsHook = useAudioTTS({
    service: {
      provider,
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
      } catch (error) {
        // eslint-disable-next-line no-console
        console.log("Speech context already initialized or error:", error)
      } finally {
        setIsSpeechContextReady(true)
      }
    }
    // Intentionally only re-runs when `supported` flips - `ttsHook` is a new
    // object every render, so including it would re-init on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsHook.supported])

  const { setSelectedVoice, voices } = ttsHook
  useEffect(() => {
    if (!voiceId) return
    const voice = voices.find((v) => v.id === voiceId)
    if (voice) setSelectedVoice(voice)
  }, [voiceId, voices, setSelectedVoice])

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

export const TTSProvider = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  const { data: settings } = useSettings()
  const provider = settings?.ttsProvider ?? "openai"
  const voiceId = settings?.ttsVoiceId ?? ""

  return (
    <TTSSession key={provider} provider={provider} voiceId={voiceId}>
      {children}
    </TTSSession>
  )
}
