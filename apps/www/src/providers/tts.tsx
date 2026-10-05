import type { JSX, ReactNode } from "react"
import type { SpeechNotice } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
import { httpSpeech } from "@some-ui/speech/http"
import { nativeSpeech } from "@some-ui/speech/native"
import { webSpeech } from "@some-ui/speech/web-speech"
import { cn } from "some-ui-utils"
import { toast } from "sonner"

import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"
import { useAuthority } from "@/lib/authority"
import { DATA_MODE } from "@/lib/data-mode"
import { deviceSpeechBackend } from "@/lib/device-speech"
import { LESSON_LANGUAGE } from "@/lib/lesson-voice"
import { useSettings } from "@/lib/tenant"
import { describeTTSEndpoint, resolveTTSEndpoint } from "@/lib/tts-config"

/**
 * Establishes the app's one speech session; `@some-ui/speech` owns its
 * lifetime. What is left here is what only this app knows: which deployment
 * it is (`DATA_MODE`: the `openai-edge-tts` container where reachable, the
 * browser's voice on Pages), and what the user picked in settings.
 *
 * Each backend is its own `@some-ui/speech` entry, and the
 * `VITE_DEVICE_BACKEND` test below folds at compile time, so the APK carries
 * only the phone's voice and the web builds never carry it (build.paths.ts
 * checks both).
 */

/**
 * Renders a speech notice through the app's toaster, except `activated`: a
 * toast on mount is gone before anyone looks, so that disclosure lives in the
 * header's speaker indicator and the inline notice on an audio activity.
 * Toasts are for what just happened and the person did not do (speech
 * breaking, recovering, unsupported).
 *
 * No budget here: `@some-ui/speech` only emits on a transition it has not
 * already announced.
 */
const announce = (notice: SpeechNotice): void => {
  if (notice.kind === "activated") return
  const render = notice.tone === "warning" ? toast.warning : toast.info
  render(notice.title, { description: notice.description })
}
/**
 * Says once, in dev, where this session looks for speech. Nothing in the UI
 * shows the endpoint, and a stale `VITE_TTS_ENDPOINT` beats every default
 * with only a 404 as evidence. Console only, for whoever runs the stack;
 * production drops `console` and the `MODE` guard keeps tests quiet.
 */
let disclosedEndpoint = false
const discloseEndpoint = (): void => {
  if (disclosedEndpoint) return
  if (!import.meta.env.DEV || import.meta.env.MODE === "test") return
  disclosedEndpoint = true
  const { endpoint, source } = describeTTSEndpoint()
  const explanation: Record<typeof source, string> = {
    override: "VITE_TTS_ENDPOINT is set - it beats the defaults",
    "same-origin-proxy": "HTTPS page, proxied to the TTS container",
    "published-port": "HTTP page, straight to the published TTS port",
    unavailable: "no window to derive one from",
  }
  // eslint-disable-next-line no-console
  console.info(
    `[www] speech endpoint: ${endpoint ?? "(none)"} - ${explanation[source]}`
  )
}

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
  // On an account, speech is the server's (`mode: DATA_MODE`); on the device
  // it is the browser's own voice (`"static"`), so text read aloud never
  // reaches the operator's TTS container. While the authority is pending,
  // `children` still render: no route waits on speech.
  const { kind } = useAuthority()
  const { data: settings } = useSettings()
  const { preferences } = useAudioPreferences()

  discloseEndpoint()

  if (kind === "pending") return <>{children}</>

  return (
    <SpeechProvider
      config={
        import.meta.env.VITE_DEVICE_BACKEND === "true"
          ? {
              // The device build has no TTS service: the phone's own engine,
              // in the voice picked in Settings.
              mode: "static",
              language: LESSON_LANGUAGE,
              native: deviceSpeechBackend(settings?.deviceVoiceId),
              adapters: { static: nativeSpeech },
            }
          : {
              mode: kind === "account" ? DATA_MODE : "static",
              adapters: { server: httpSpeech, static: webSpeech },
              hosted: settings?.ttsVoice,
              endpoint: resolveTTSEndpoint(),
            }
      }
      fallback={<InitializingSpeech />}
      // Muting stops what is speaking and drops the queue without ending the
      // session.
      muted={!preferences.speech.enabled}
      notify={announce}
    >
      {children}
    </SpeechProvider>
  )
}
