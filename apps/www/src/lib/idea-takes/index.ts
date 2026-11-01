/**
 * The takes of Studio's idea answers, on the phone (MIC10, #2428): a desk of
 * takes (`lib/takes-desk`), at most forty, each at most a minute, recorded
 * through the shared take kit. Each goes home as a Studio voice note
 * (`lib/home-link/voice-copy`: `studio`, `idea:<idea>:<question>`), and home
 * gives its words back (`lib/idea-hearing`). At its cap a new take makes room
 * by letting go the oldest home holds, and is refused while home holds none
 * (HF5). Phone-only (`build.paths.ts`).
 */
import type { IdeaTakes, IdeaTakeSnapshot } from "@some-ui/soundbites"

import type { DeskSnapshot, PhoneTakes } from "@/lib/takes-desk"
import { takesDesk } from "@/lib/takes-desk"

export type { Take as IdeaTake } from "@/lib/takes-desk"

/** A spoken answer runs up to a minute, as a Jobs note does. */
const MAX_MS = 60_000
const MAX = 40

const desk = takesDesk({
  key: "some-ui:idea-takes",
  dbName: "some-ui.idea-takes",
  limits: { max: MAX, maxMs: MAX_MS },
})

export const sweepIdeaTakes = desk.sweep
/** The desk, for the copy home (`lib/home-link/voice-copy`). */
export const ideaTakesDesk = desk

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
  }
}

/** The phone's idea takes, as the idea screen's take port. */
export function ideaTakes(): IdeaTakes {
  return ideaTakesOf(desk.phone())
}
