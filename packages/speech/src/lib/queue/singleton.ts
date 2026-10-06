/**
 * @module queue/singleton
 *
 * There is one speech queue per page, because there is one pair of
 * speakers. This module owns it.
 *
 * **One live manager, keyed by adapter identity.** Switching provider,
 * remounting, or navigating between pages that each initialize speech must
 * not keep speaking through the old session's torn-down adapter.
 * Re-initializing with the same adapter is a no-op (React Strict Mode
 * double-invokes effects, and that must not churn the queue); initializing
 * with a different adapter disposes the old manager first, which aborts its
 * items and flushes its promises before the new one exists.
 */

import type { SpeechAdapter } from "@speech/lib/adapters/types"

import { SpeechQueueManager } from "./manager"

let current: SpeechQueueManager | null = null

export function initializeSpeechQueue(
  adapter: SpeechAdapter
): SpeechQueueManager {
  if (current && !current.isDisposed() && current.getAdapter() === adapter) {
    return current
  }

  resetSpeechQueue()
  current = new SpeechQueueManager(adapter)
  return current
}

export function getSpeechQueue(): SpeechQueueManager {
  if (!current || current.isDisposed()) {
    throw new Error(
      "Speech queue not initialized. Render <SpeechProvider> (or call initializeSpeechQueue) first."
    )
  }
  return current
}

/** The queue, or null when no session is live. Never throws. */
export function peekSpeechQueue(): SpeechQueueManager | null {
  return current && !current.isDisposed() ? current : null
}

/**
 * Ends the current session. Safe to call when there isn't one, and safe to
 * call twice - both matter, because this runs from React effect cleanups.
 */
export function resetSpeechQueue(): void {
  current?.dispose()
  current = null
}

/**
 * Ends `manager` only if it is still the live session. React cleanups run
 * after the *next* session has already been installed under Strict Mode and
 * on fast provider swaps; an unconditional reset there would tear down the
 * session that just replaced it.
 */
export function releaseSpeechQueue(manager: SpeechQueueManager): void {
  if (current !== manager) {
    manager.dispose()
    return
  }
  resetSpeechQueue()
}
