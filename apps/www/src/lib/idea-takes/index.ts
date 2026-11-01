/**
 * The takes of Studio's idea answers, on the phone, in two desks (each at
 * most forty takes of at most a minute; at its cap a new take makes room by
 * letting go the oldest home holds, and is refused while home holds none,
 * HF5). Each take goes home as a Studio voice note
 * (`lib/home-link/voice-copy`: `studio`, `idea:<idea>:<question>`).
 *
 * - **A new idea's answers** (ST26, #2453): the take pattern with `send:
 *   "on-confirm"` (`lib/takes-desk/pattern`). Each take waits on this phone
 *   until the idea is sent whole (`release`); until then nothing copies it
 *   home, and Delete removes it for good (the owner's ruling on #2265).
 * - **Answers to Claude's questions about an idea** (MIC10, #2428), through
 *   the take kit: each goes home as soon as it is kept, and home gives its
 *   words back (`lib/idea-hearing`).
 *
 * Phone-only (`build.paths.ts`).
 */
import type {
  BundleTakes,
  IdeaTakes,
  IdeaTakeSnapshot,
} from "@some-ui/soundbites"
import { ONE_TAKE } from "@some-ui/voice-capture"

import type { DeskSnapshot, PhoneTakes } from "@/lib/takes-desk"
import { patternDesk, takesDesk } from "@/lib/takes-desk"

export type { Take as IdeaTake } from "@/lib/takes-desk"

/** A spoken answer runs up to a minute, as a Jobs note does. */
const MAX_MS = 60_000
const MAX = 40

const desk = takesDesk({
  key: "some-ui:idea-takes",
  // The kit's desk: no Let go.
  from: null,
  dbName: "some-ui.idea-takes",
  limits: { max: MAX, maxMs: MAX_MS },
})

/** A new idea's answers (ST26): each waits on the phone until it is sent. */
const bundleDesk = patternDesk({
  key: "some-ui:idea-bundle-takes",
  // No set-aside marks: a take here is let go only by a new idea's Delete,
  // Redo or clean-up before Send, for good, and only while it waits (LA13).
  from: null,
  dbName: "some-ui.idea-bundle-takes",
  limits: { max: MAX, maxMs: MAX_MS },
  shape: { ...ONE_TAKE, send: "on-confirm" },
})

export function sweepIdeaTakes(): void {
  desk.sweep()
  bundleDesk.sweep()
}
/** The desks, for the copy home (`lib/home-link/voice-copy`). */
export const ideaTakesDesk = desk
export const ideaBundleDesk = bundleDesk

/** The phone's desk of a new idea's takes, as its screen uses it (ST26). */
export const ideaBundleTakes = (): BundleTakes => bundleDesk.phone()

/** The desk's snapshot as an idea's answers read it. */
function ideaTakeSnapshot(snapshot: DeskSnapshot): IdeaTakeSnapshot {
  const { ended } = snapshot
  return {
    take: snapshot.take.kind,
    ended:
      ended === null
        ? null
        : {
            seq: ended.seq,
            ending: ended.end,
            id: ended.id,
            reason: ended.end === "blocked" ? snapshot.blocked : null,
            unheard: ended.unheard,
          },
    full: snapshot.full,
  }
}

/** A desk as the idea screen's take port (`@some-ui/soundbites`' `homeHearing`). */
export function ideaTakesOf(phone: PhoneTakes): IdeaTakes {
  return {
    getSnapshot: () => ideaTakeSnapshot(phone.getSnapshot()),
    subscribe: phone.subscribe,
    start: phone.start,
    stop: phone.stop,
    // `reset` keeps a take under way, as the screen going asks.
    leave: phone.reset,
    held: phone.held,
  }
}

/** The phone's idea takes, as the idea screen's take port. */
export function ideaTakes(): IdeaTakes {
  return ideaTakesOf(desk.phone())
}
