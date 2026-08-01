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
import { createContext, useContext, useEffect, useState } from "react"
import type { SpeechAdapter, SpeechConfig } from "@speech/lib/adapters"
import { createSpeechAdapter, resolveSpeechConfig } from "@speech/lib/adapters"
import type { SpeechQueueManager } from "@speech/lib/queue"
import { initializeSpeechQueue, releaseSpeechQueue } from "@speech/lib/queue"
import type { SpeechNotifier } from "@speech/lib/status"

import { SpeechStatusAnnouncer } from "../speech-status"

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
 * `adapters` and `fetchImpl` are deliberately excluded - they are function
 * references, they cannot be serialized, and the callers that pass them
 * (tests, future backends) pass stable ones.
 */
function configKeyOf(config: SpeechConfig): string {
  return JSON.stringify([
    config.mode ?? null,
    config.endpoint ?? null,
    config.apiKey ?? null,
    config.provider ?? null,
    config.format ?? null,
    config.timeoutMs ?? null,
    config.voiceId ?? null,
    config.lang ?? null,
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
    const resolved = resolveSpeechConfig(config)
    const adapter = createSpeechAdapter(config)
    const manager = initializeSpeechQueue(adapter, {
      defaultVoice: resolved.voice,
    })
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
    // render for any caller passing an inline literal.
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
 * The session if there is one, `null` if there isn't.
 *
 * For code that can work without a voice and must not crash when there is
 * none - a lazily-loaded applet that a host may mount anywhere, a Storybook
 * story, a test. Speech is genuinely ambient (there is one pair of speakers
 * per page), so reading it from context is right; requiring it to exist is
 * not, and a consumer should not have to know how to check.
 *
 * `useSpeechSession` stays throwing for code that has no meaning without a
 * voice - being explicit about which of the two you are is the point.
 */
export function useOptionalSpeechSession(): SpeechSession | null {
  return useContext(SpeechSessionContext)
}

export function useOptionalSpeechAdapter(): SpeechAdapter | null {
  return useOptionalSpeechSession()?.adapter ?? null
}

/**
 * The session's adapter, for call sites that speak directly rather than
 * through the queue (a one-shot prompt, a question read aloud). Queued,
 * priority-ordered speech should use `useSpeechQueue` instead.
 */
export function useSpeechAdapter(): SpeechAdapter {
  return useSpeechSession().adapter
}
