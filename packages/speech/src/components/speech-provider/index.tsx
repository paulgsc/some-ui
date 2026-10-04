/**
 * @module components/speech-provider
 *
 * The session boundary: one adapter, one queue, created when this mounts
 * and destroyed when it unmounts or its configuration changes.
 *
 * Everything a consumer app used to do by hand - build a TTS hook out of a
 * hardcoded endpoint and API key, call `initializeSpeechQueue` from an
 * effect, swallow the "already initialized" error, and never tear any of it
 * down - happens here instead, once, correctly. The app supplies
 * configuration; which backend that configuration resolves to is this
 * package's business (see `adapters/registry`).
 *
 * Changing the configuration ends the old session before the new one
 * starts: the old adapter is disposed, which flushes every promise it still
 * owed, so the new session cannot inherit an utterance, a queued item or a
 * wedged await from the old one.
 */

import type { JSX, ReactNode } from "react"
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useState,
} from "react"
import { SpeechStatusAnnouncer } from "@speech/components/speech-status"
import type {
  SpeechAdapter,
  SpeechConfig,
  VoiceReport,
} from "@speech/lib/adapters"
import { createSpeechAdapter } from "@speech/lib/adapters"
import type { SpokenLanguage } from "@speech/lib/language"
import type { SpeechQueueManager } from "@speech/lib/queue"
import { initializeSpeechQueue, releaseSpeechQueue } from "@speech/lib/queue"
import type {
  PreviewOptions,
  Speaker,
  SpeechOutcome,
} from "@speech/lib/speaker"
import type { SpeechNotifier } from "@speech/lib/status"

export type SpeechSession = {
  readonly adapter: SpeechAdapter
  readonly manager: SpeechQueueManager
}

const SpeechSessionContext = createContext<SpeechSession | null>(null)

export type SpeechProviderProps = {
  children: ReactNode
  config?: SpeechConfig
  /** Rendered while the session is being established (one commit). */
  fallback?: ReactNode
  /**
   * Turns voice output off without ending the session.
   *
   * Deliberately not part of the session's configuration key: muting is a
   * preference a person flips, possibly often, and rebuilding the adapter
   * and queue on each flip would tear down a live audio context to express
   * "be quiet". It is applied to the running session instead.
   */
  muted?: boolean
  /**
   * Where user-facing notices go - typically the app's toast function.
   *
   * A page that starts talking is a surprise, so the session announces
   * itself once on mount, once if speech breaks, and once if it recovers.
   * That budget is enforced here (`lib/status`), not by the caller: the
   * sink is handed whole notices, never events, so no consumer can turn a
   * failing backend into a stream of toasts.
   *
   * Omitting it is silent but not undisclosed - the `aria-live` region
   * below announces the same notices either way.
   */
  notify?: SpeechNotifier
}

/**
 * Config identity without the object identity. A caller writing
 * `config={{ mode, endpoint }}` inline creates a new object every render;
 * keying the session on the *values* keeps that from tearing the session
 * down and rebuilding it on each one.
 *
 * `adapters`, `fetchImpl` and the native engine are deliberately excluded -
 * they are function references, they cannot be serialized, and the callers
 * that pass them (tests, the Android app) pass stable ones. Whether there is
 * a native engine, and the phone voice chosen for it, are part of the key.
 */
function configKeyOf(config: SpeechConfig): string {
  return JSON.stringify([
    config.mode ?? null,
    config.endpoint ?? null,
    config.apiKey ?? null,
    config.hosted?.provider ?? null,
    config.hosted?.voiceId ?? null,
    config.format ?? null,
    config.timeoutMs ?? null,
    config.language ?? null,
    config.native ? "native" : null,
    config.native?.voiceId ?? null,
    config.fallbackWhenUnsupported ?? null,
    config.serverHostnames ?? null,
  ])
}

export const SpeechProvider = ({
  children,
  config = {},
  fallback = null,
  muted = false,
  notify,
}: SpeechProviderProps): JSX.Element => {
  const [session, setSession] = useState<SpeechSession | null>(null)
  const configKey = configKeyOf(config)

  useEffect(() => {
    const adapter = createSpeechAdapter(config)
    const manager = initializeSpeechQueue(adapter)
    // Muted from its first moment, not one effect later: React runs a
    // child's effects before its parent's, so an applet that speaks on
    // mount (a prompt that auto-plays) would otherwise reach the speaker
    // before the effect below had muted it, and a page opened muted would
    // say its first line anyway.
    manager.setMuted(muted)
    /*
     * The session *is* the external system this effect synchronizes with,
     * and its handle has to reach the tree. Creating it during render
     * instead would build a real adapter (audio context, network client) on
     * every discarded render pass, with no cleanup to dispose it. The one
     * extra commit this costs is what `fallback` renders.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setSession({ adapter, manager })

    return (): void => {
      setSession(null)
      releaseSpeechQueue(manager)
      adapter.dispose()
    }
    // `config` is intentionally absent: `configKey` is its value-identity,
    // and depending on the object itself would rebuild the session on every
    // render for any caller passing an inline literal. So is `muted`: it is
    // only the new session's starting state here, and flipping it must not
    // rebuild the session - the effect below applies every later change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey])

  useEffect(() => {
    session?.manager.setMuted(muted)
  }, [session, muted])

  if (!session) return <>{fallback}</>

  return (
    <SpeechSessionContext.Provider value={session}>
      <SpeechStatusAnnouncer muted={muted} notify={notify} />
      {children}
    </SpeechSessionContext.Provider>
  )
}

export function useSpeechSession(): SpeechSession {
  const session = useContext(SpeechSessionContext)
  if (!session) {
    throw new Error("useSpeechSession must be used within a <SpeechProvider>")
  }
  return session
}

/**
 * This component's handle on the page's speech, or `null` when no
 * `<SpeechProvider>` is mounted.
 *
 * The one way an applet speaks (`lib/speaker`): its lines go through the
 * session, which decides what plays, and its `stop` reaches only its own
 * lines. Each component gets its own handle, so one applet stopping cannot
 * silence another. Null rather than throwing, because speech is ambient and
 * optional: a lazily-loaded applet a host may mount anywhere, a story or a
 * test runs without a voice, and silence is a degraded lesson rather than a
 * broken one. There is deliberately no way to reach the adapter from here:
 * the session decides the voice and honors mute, and an applet holding the
 * adapter could do neither.
 */
export function useSpeaker(): Speaker | null {
  const manager = useContext(SpeechSessionContext)?.manager ?? null
  const owner = useId()
  return useMemo(() => manager?.speakerFor(owner) ?? null, [manager, owner])
}

/**
 * Re-renders the caller when `speaker` says its voices or mute changed,
 * which a browser's or a phone's voices do some time after the page loads.
 */
function useSpeakerUpdates(speaker: Speaker | null): void {
  const [, refresh] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!speaker) return undefined
    const unsubscribe = speaker.subscribe(refresh)
    // A change announced between this render's read and the subscription
    // just made had no listener to tell: Chrome's voices load in response
    // to the very `getVoices()` call that read them. Read once more.
    refresh()
    return unsubscribe
  }, [speaker])
}

/**
 * Who would read a line in `language` on this page, kept current. `null`
 * without a `<SpeechProvider>`.
 */
export function useVoiceReport(language: SpokenLanguage): VoiceReport | null {
  const speaker = useSpeaker()
  useSpeakerUpdates(speaker)
  return speaker ? speaker.describe(language) : null
}

export type VoicePreview = {
  /** Says a sample line through the session; see `SpeechQueueManager.preview`. */
  readonly play: (
    text: string,
    options: PreviewOptions
  ) => Promise<SpeechOutcome>
  /** Whether the person has muted voice output, so a sample is refused. */
  readonly muted: boolean
}

/**
 * Settings' sample of a voice a person is choosing between, kept current
 * with mute. `null` without a `<SpeechProvider>`.
 */
export function useVoicePreview(): VoicePreview | null {
  const manager = useContext(SpeechSessionContext)?.manager ?? null
  const speaker = useSpeaker()
  useSpeakerUpdates(speaker)
  if (!manager || !speaker) return null
  return {
    play: (text, options) => manager.preview(text, options),
    muted: speaker.muted,
  }
}
