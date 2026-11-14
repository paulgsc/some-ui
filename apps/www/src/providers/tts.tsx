import type { JSX, ReactNode } from "react"
import { cn } from "@some-ui/core-utils"
import type { SpeechNotice } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
import { nativeSpeech } from "@some-ui/speech/native"
import { webSpeech } from "@some-ui/speech/web-speech"
import { toast } from "sonner"

import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"
import { deviceSpeechBackend } from "@/lib/device-speech"
import { LESSON_LANGUAGE } from "@/lib/lesson-voice"
import { useSettings } from "@/lib/tenant"

/**
 * Establishes the app's one speech session; `@some-ui/speech` owns its
 * lifetime. What is left here is what only this app knows: which device it
 * runs on, and the phone voice picked in Settings. Every web build speaks
 * with the browser's own voice, signed in or not; the Android app speaks
 * with the phone's.
 *
 * Each backend is its own `@some-ui/speech` entry, and the
 * `VITE_DEVICE_BACKEND` test below folds at compile time, so the APK carries
 * only the phone's voice and the web builds only the browser's
 * (build.paths.ts checks both).
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
  const { preferences } = useAudioPreferences()

  return (
    <SpeechProvider
      config={
        import.meta.env.VITE_DEVICE_BACKEND === "true"
          ? {
              // The phone's own engine, in the voice picked in Settings.
              language: LESSON_LANGUAGE,
              native: deviceSpeechBackend(settings?.deviceVoiceId),
              backend: nativeSpeech,
            }
          : {
              // The browser's voice: where `speechSynthesis` is missing it
              // is silent, and says so.
              backend: webSpeech,
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
