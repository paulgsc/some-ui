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
import { exchangeVoice } from "@/lib/voice-home/home"

import type { KeptState } from "./kept-model"
import type { Lane, LaneCounts } from "./lanes"
import { useLaneHome } from "./lanes"
import { candidates, VOICE_SCOPES, watchVoiceNotes } from "./voice-copy"

export const voiceLane: Lane = {
  id: "voice",
  scopes: VOICE_SCOPES.scopes,
  exchange: (send) => exchangeVoice(phoneVoiceHome().keeping, send),
  revision: () => phoneVoiceHome().getSnapshot().waiting.length,
  subscribe: (listener) => phoneVoiceHome().subscribe(listener),
  useCounts: (): LaneCounts => {
    const home = phoneVoiceHome()
    const state = useSyncExternalStore(home.subscribe, home.getSnapshot)
    // Read so a reflection or Jobs note added renders the offer again.
    useSyncExternalStore(reflections.subscribe, reflections.getSnapshot)
    const jobs = phoneJobs()
    useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
    const onPhone = candidates().filter(({ note }) => !home.settled(note.id))
    return {
      held: { voice: state.held.length },
      refused: { voice: state.refused.length },
      waiting: state.waiting.length,
      away: null,
      hidden: 0,
      pulled: true,
      offered: state.waiting.length + onPhone.length,
    }
  },
}

/**
 * Sending voice notes home, and copying each new one, for as long as the
 * app shell is mounted.
 */
export function useVoiceHome(): KeptState {
  useEffect(() => watchVoiceNotes(), [])
  return useLaneHome(voiceLane)
}
