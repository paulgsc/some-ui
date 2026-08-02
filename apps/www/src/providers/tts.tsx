import type { JSX, ReactNode } from "react"
import type { SpeechNotice } from "@some-ui/speech"
import { SpeechProvider } from "@some-ui/speech"
import { cn } from "some-ui-utils"
import { toast } from "sonner"

import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"
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

/**
 * Renders a speech notice through the app's existing toaster - except the
 * one that teaches the feature.
 *
 * `activated` is dropped here deliberately. A toast on initial mount is the
 * easiest thing in the interface to miss: it arrives while a person is
 * still orienting themselves visually, and it is gone before they look. So
 * the disclosure that this app has a voice lives where it can be found on
 * purpose - the speaker indicator in the header (always visible, always
 * current) and the one-time inline notice on an audio activity. Both
 * outlast a toast because neither disappears.
 *
 * What is left is the part a toast is genuinely good at: acknowledging
 * something that just happened and that the person did not do. Speech
 * breaking, recovering, or turning out to be unsupported are all events
 * they would otherwise have to infer from silence.
 *
 * The budget is not enforced here and must not be: `@some-ui/speech` emits
 * a notice only on a transition it has not already announced, so this sees
 * at most a handful of calls across a whole session no matter how many
 * utterances failed underneath.
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
      config={{
        mode: DATA_MODE,
        provider: settings?.ttsProvider,
        voiceId: settings?.ttsVoiceId || undefined,
        endpoint: resolveTTSEndpoint(),
      }}
      fallback={<InitializingSpeech />}
      // The speech channel of the app's audio preferences, live. Muting
      // stops what is speaking and drops what was queued, without ending
      // the session - the toggle is a preference, not a teardown.
      muted={!preferences.speech.enabled}
      notify={announce}
    >
      {children}
    </SpeechProvider>
  )
}
