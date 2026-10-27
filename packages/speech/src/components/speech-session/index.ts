/**
 * @module components/speech-session
 *
 * The handle `SpeechProvider` puts in the tree: the session's adapter and
 * queue. Its own module because the provider renders `SpeechStatusAnnouncer`,
 * which reads the session back; were the context declared in the provider,
 * the two modules would import each other.
 */

import { createContext, useContext } from "react"
import type { SpeechAdapter } from "@speech/lib/adapters"
import type { SpeechQueueManager } from "@speech/lib/queue"

export type SpeechSession = {
  readonly adapter: SpeechAdapter
  readonly manager: SpeechQueueManager
}

export const SpeechSessionContext = createContext<SpeechSession | null>(null)

export function useSpeechSession(): SpeechSession {
  const session = useContext(SpeechSessionContext)
  if (!session) {
    throw new Error("useSpeechSession must be used within a <SpeechProvider>")
  }
  return session
}
