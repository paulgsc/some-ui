/**
 * The voice notes' lane (LA13, docs/learner-data-authority.md): each
 * finished voice note a routine hears, copied for home while its person
 * keeps voice notes on home (`./voice-copy`, which says which notes and how
 * each is told), and sent through the one wiring (`./lanes`) by
 * `exchangeVoice` (`lib/voice-home/home`). There is no mark: the app shell
 * mounts `useVoiceHome` on every screen, so notes go from any wing.
 */
import { useEffect, useSyncExternalStore } from "react"
import type { OutboxPort, OutboxView } from "@some-ui/game-week"

import { phoneGameBites } from "@/lib/game-bites"
import { phoneJobs } from "@/lib/jobs"
import { reflections } from "@/lib/session-reflection"
import { phoneVoiceHome } from "@/lib/voice-home"
import type { Unsendable, VoiceHomeState } from "@/lib/voice-home/model"

import { phoneConsent } from "./consent-runtime"
import { homeLink } from "./index"
import type { KeptState } from "./kept-model"
import type { Lane, LaneCounts } from "./lanes"
import { keptNow, useLaneHome } from "./lanes"
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
    // Read so a reflection, Jobs note or game bite added renders the offer again.
    useSyncExternalStore(reflections.subscribe, reflections.getSnapshot)
    const jobs = phoneJobs()
    useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
    const bites = phoneGameBites()
    useSyncExternalStore(bites.subscribe, bites.getSnapshot)
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

/*
 * What of the game bites is still only on this phone (`@some-ui/game-week`'s
 * `OutboxPort`), for the recorder to say in the person's terms: how many
 * the phone could not keep yet (held while the app is open), how many
 * home does not hold yet, how many home said it can't take (each stays on
 * this phone, its copy for home included), and whether this phone sends
 * voice notes home at all. It reads, and sends nothing.
 */

/**
 * The view from the bites not kept yet, the kept bites' ids, what home
 * answered, and whether they are sent.
 */
export function outboxView(
  notKept: number,
  ids: ReadonlyArray<string>,
  home: VoiceHomeState,
  sending: boolean
): OutboxView {
  const held = new Set(home.held)
  const refused = new Set(home.refused.map(({ id }) => id))
  return {
    notKept,
    waiting: ids.filter((id) => !held.has(id) && !refused.has(id)).length,
    refused: ids.filter((id) => refused.has(id)).length,
    sending,
  }
}

let last: OutboxView | null = null

function sameView(a: OutboxView, b: OutboxView): boolean {
  return (
    a.notKept === b.notKept &&
    a.waiting === b.waiting &&
    a.refused === b.refused &&
    a.sending === b.sending
  )
}

export const gameOutbox: OutboxPort = {
  getSnapshot(): OutboxView {
    const bites = phoneGameBites()
    const next = outboxView(
      bites.unkept(),
      bites.getSnapshot().map(({ id }) => id),
      phoneVoiceHome().getSnapshot(),
      keptNow(VOICE_SCOPES)
    )
    // The same view while nothing changed, as `useSyncExternalStore` asks.
    if (last === null || !sameView(last, next)) last = next
    return last
  },
  subscribe(listener): () => void {
    const stops = [
      phoneGameBites().subscribe(listener),
      phoneVoiceHome().subscribe(listener),
      phoneConsent().subscribe(listener),
      homeLink().subscribe(listener),
    ]
    return (): void => {
      for (const stop of stops) stop()
    }
  },
}
