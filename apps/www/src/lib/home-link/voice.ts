/**
 * The voice notes' lane (LA13, LA15, docs/learner-data-authority.md): each
 * finished voice note a routine hears, copied for home while the phone is
 * paired (`./voice-copy`, which says which notes and how each is told), and
 * sent through the one wiring (`./lanes`) by `exchangeVoice`
 * (`lib/voice-home/home`), then the set-aside marks owed for notes the
 * owner let go (`./set-aside`, MIC2). The lane has no wing mark of its
 * own: the app shell mounts `useVoiceHome` on every screen, so notes go
 * from any wing.
 */
import { useEffect, useSyncExternalStore } from "react"
import type { OutboxPort, OutboxView } from "@some-ui/game-week"

import type { PhoneBite } from "@/lib/game-bites"
import { phoneGameBites } from "@/lib/game-bites"
import { ideaBundleDesk, ideaTakesDesk } from "@/lib/idea-takes"
import { phoneJobs } from "@/lib/jobs"
import { leetypeTakesDesk } from "@/lib/leetype-takes"
import { lensTakesDesk } from "@/lib/lens-takes"
import { reflections } from "@/lib/session-reflection"
import { phoneVoiceHome } from "@/lib/voice-home"
import type { Unsendable, VoiceHomeState } from "@/lib/voice-home/model"

import { homeLink, paired } from "./index"
import type { KeptState } from "./kept-model"
import type { Lane, LaneCounts } from "./lanes"
import { useLaneHome } from "./lanes"
import {
  candidates,
  copyPasses,
  sendVoice,
  storesRead,
  unsendable,
  watchVoiceNotes,
} from "./voice-copy"

export const voiceLane: Lane = {
  id: "voice",
  exchange: sendVoice,
  // A mark owed for a note set aside (MIC2) is something to send too.
  revision: () => {
    const { waiting, aside } = phoneVoiceHome().getSnapshot()
    return waiting.length + aside.owed.length
  },
  subscribe: (listener) => phoneVoiceHome().subscribe(listener),
  useCounts: (): LaneCounts => {
    const home = phoneVoiceHome()
    const state = useSyncExternalStore(home.subscribe, home.getSnapshot)
    // Read so a reflection, Jobs note, game bite, Studio take, soundbite,
    // lens take, LeetType take or idea take added, or a new idea's sent,
    // renders the offer again.
    useSyncExternalStore(reflections.subscribe, reflections.getSnapshot)
    const jobs = phoneJobs()
    useSyncExternalStore(jobs.subscribe, jobs.getSnapshot)
    const bites = phoneGameBites()
    useSyncExternalStore(bites.subscribe, bites.getSnapshot)
    useSyncExternalStore(storesRead.subscribe, storesRead.getSnapshot)
    const lens = lensTakesDesk.phone().takes
    useSyncExternalStore(lens.subscribe, lens.getSnapshot)
    const leetype = leetypeTakesDesk.phone().takes
    useSyncExternalStore(leetype.subscribe, leetype.getSnapshot)
    const ideas = ideaTakesDesk.phone()
    useSyncExternalStore(ideas.subscribe, ideas.getSnapshot)
    // A new idea's takes, released by its Send (ST26).
    const bundle = ideaBundleDesk.phone().takes
    useSyncExternalStore(bundle.subscribe, bundle.getSnapshot)
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
      hidden: 0,
      pulled: true,
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
  const pass = useSyncExternalStore(
    copyPasses.subscribe,
    copyPasses.getSnapshot
  )
  return unsendable(pass, home.settled)
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
 * this phone, its copy for home included), how many home holds instead
 * and since when, and whether this phone is paired with home, so they go.
 * It reads, and sends nothing.
 */

/**
 * The view from the bites not kept yet, the kept bites, what home
 * answered, and whether they are sent.
 */
export function outboxView(
  notKept: number,
  bites: ReadonlyArray<PhoneBite>,
  home: VoiceHomeState,
  sending: boolean
): OutboxView {
  const held = new Set(home.held)
  const refused = new Set(home.refused.map(({ id }) => id))
  const since = bites.flatMap(({ homeSince }) =>
    homeSince === undefined ? [] : [homeSince]
  )
  return {
    notKept,
    // A bite the record says home holds never waits, even if home's
    // answers here were lost.
    waiting: bites.filter(
      ({ id, homeSince }) =>
        homeSince === undefined && !held.has(id) && !refused.has(id)
    ).length,
    refused: bites.filter(({ id }) => refused.has(id)).length,
    sending,
    onHome:
      since.length === 0
        ? null
        : { count: since.length, since: Math.min(...since) },
  }
}

let last: OutboxView | null = null

function sameView(a: OutboxView, b: OutboxView): boolean {
  return (
    a.notKept === b.notKept &&
    a.waiting === b.waiting &&
    a.refused === b.refused &&
    a.sending === b.sending &&
    a.onHome?.count === b.onHome?.count &&
    a.onHome?.since === b.onHome?.since
  )
}

export const gameOutbox: OutboxPort = {
  getSnapshot(): OutboxView {
    const bites = phoneGameBites()
    const next = outboxView(
      bites.unkept(),
      bites.getSnapshot(),
      phoneVoiceHome().getSnapshot(),
      paired()
    )
    // The same view while nothing changed, as `useSyncExternalStore` asks.
    if (last === null || !sameView(last, next)) last = next
    return last
  },
  subscribe(listener): () => void {
    const stops = [
      phoneGameBites().subscribe(listener),
      phoneVoiceHome().subscribe(listener),
      homeLink().subscribe(listener),
    ]
    return (): void => {
      for (const stop of stops) stop()
    }
  },
}
