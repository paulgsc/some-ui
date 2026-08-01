import type { JSX, ReactNode } from "react"
import { SpeechProvider } from "@some-ui/speech"
import { cn } from "some-ui-utils"

import { DATA_MODE } from "@/lib/data-mode"
import { useSettings } from "@/lib/tenant"
import { resolveTTSEndpoint } from "@/lib/tts-config"

/**
 * Establishes the app's one speech session.
 *
 * This used to build a TTS hook from a hardcoded endpoint and API key, call
 * `initializeSpeechQueue` from an effect, swallow the "already initialized"
 * error that a second call always produced, and never tear any of it down -
 * which is why switching provider kept speaking through the torn-down one.
 * All of that is `@some-ui/speech`'s job now; what is left here is the two
 * things only this app knows: which deployment it is, and what the user
 * picked in settings.
 *
 * `DATA_MODE` is the same build-time bit the content shims use ("static" is
 * the GitHub Pages build, "server" is dev/preview/Docker). The speech
 * package turns it into a backend: the `openai-edge-tts` container where
 * one is reachable, the browser's own voice on Pages where nothing is.
 */
const InitializingSpeech = (): JSX.Element => (
  <div className={cn("flex items-center justify-center gap-3 p-4")}>
    <div className={cn("bg-primary/20 size-12 animate-pulse rounded-full")} />
    <span className={cn("text-muted-foreground animate-pulse font-medium")}>
      Initializing TTS Provider...
    </span>
  </div>
)

export const TTSProvider = ({
  children,
}: {
  children: ReactNode
}): JSX.Element => {
  const { data: settings } = useSettings()

  return (
    <SpeechProvider
      config={{
        mode: DATA_MODE,
        provider: settings?.ttsProvider,
        voiceId: settings?.ttsVoiceId || undefined,
        endpoint: resolveTTSEndpoint(),
      }}
      fallback={<InitializingSpeech />}
    >
      {children}
    </SpeechProvider>
  )
}
