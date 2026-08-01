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

  if (!session) return <>{fallback}</>

  return (
    <SpeechSessionContext.Provider value={session}>
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
 * The session's adapter, for call sites that speak directly rather than
 * through the queue (a one-shot prompt, a question read aloud). Queued,
 * priority-ordered speech should use `useSpeechQueue` instead.
 */
export function useSpeechAdapter(): SpeechAdapter {
  return useSpeechSession().adapter
}
