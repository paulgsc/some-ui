/**
 * The voice notes' lane (LA13, docs/learner-data-authority.md): each
 * finished voice note a routine hears, copied for home while its person
 * keeps voice notes on home (`./voice-copy`, which says which notes and how
 * each is told), and sent through the one wiring (`./lanes`) by
 * `exchangeVoice` (`lib/voice-home/home`). There is no mark: the app shell
 * mounts `useVoiceHome` on every screen, so notes go from any wing.
 */
import { useEffect, useSyncExternalStore } from "react"

import { phoneJobs } from "@/lib/jobs"
import { reflections } from "@/lib/session-reflection"
import { phoneVoiceHome } from "@/lib/voice-home"

import type { KeptState } from "./kept-model"
import type { Lane, LaneCounts } from "./lanes"
import { useLaneHome } from "./lanes"
import type { Unsendable } from "./voice-copy"
import {
  candidates,
  copyPasses,
  sendVoice,
  unsendable,
  VOICE_SCOPES,
  watchVoiceNotes,
} from "./voice-copy"

export const voiceLane: Lane = {
  id: "voice",
  scopes: VOICE_SCOPES.scopes,
  exchange: sendVoice,
  revision: () => phoneVoiceHome().getSnapshot().waiting.length,
  subscribe: (listener) => phoneVoiceHome().subscribe(listener),
  useCounts: (): LaneCounts => {
    const home = phoneVoiceHome()
    const state = useSyncExternalStore(home.subscribe, home.getSnapshot)
    // Read so a reflection or Jobs note added renders the offer again.
    useSyncExternalStore(reflections.subscribe, reflections.getSnapshot)
    const jobs = phoneJobs()
    useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
    const { gone } = useSyncExternalStore(
      copyPasses.subscribe,
      copyPasses.getSnapshot
    )
    // A note whose audio is gone can't go, so it isn't waiting (LA14).
    const onPhone = candidates().filter(
      ({ note }) => !home.settled(note.id) && !gone.has(note.id)
    )
    return {
      held: { voice: state.held.length },
      refused: { voice: state.refused.length },
      // A note not copied yet is no safer than one copied and not sent.
      waiting: state.waiting.length + onPhone.length,
      away: null,
      hidden: 0,
      pulled: true,
      offered: state.waiting.length + onPhone.length,
    }
  },
}

/**
 * The voice notes this phone holds and can't send home, by why (LA14), as
 * Settings names them (`unsentLines`).
 */
export function useUnsendable(): Unsendable {
  const home = phoneVoiceHome()
  useSyncExternalStore(home.subscribe, home.getSnapshot)
  const jobs = phoneJobs()
  const { state } = useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
  const pass = useSyncExternalStore(
    copyPasses.subscribe,
    copyPasses.getSnapshot
  )
  return unsendable(state, pass, home.settled)
}

/**
 * Sending voice notes home, and copying each new one, for as long as the
 * app shell is mounted.
 */
export function useVoiceHome(): KeptState {
  useEffect(() => watchVoiceNotes(), [])
  return useLaneHome(voiceLane)
}
