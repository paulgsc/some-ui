/**
 * The takes of Studio's idea answers, on the phone, in three desks (each at
 * most forty takes of at most a minute; at its cap a new take makes room by
 * letting go the oldest home holds, and is refused while home holds none,
 * HF5). Each take goes home as a Studio voice note
 * (`lib/home-link/voice-copy`: `studio`, `idea:<idea>:<question>`, or an
 * ask's ref for an ask answered by voice, SFEED5's `lib/ask-answer`).
 *
 * - **A new idea's answers** (ST26, #2453): the take pattern with `send:
 *   "on-confirm"` (`lib/takes-desk/pattern`). Each take waits on this phone
 *   until the idea is sent whole (`release`); until then nothing copies it
 *   home, and Delete removes it for good (the owner's ruling on #2265).
 * - **An answer of an idea on home, said again** (#2579): the same pattern
 *   on a desk of its own (`some-ui:idea-redo-takes`). Each waits until the
 *   idea is sent again; then it goes home, and the take it replaces is set
 *   aside there (`setAsideReplaced`, the owner's ruling on #2453).
 * - **Answers to Claude's questions about an idea** (MIC10, #2428), through
 *   the take kit: each goes home as soon as it is kept, and home gives its
 *   words back (`lib/idea-hearing`).
 *
 * Phone-only (`build.paths.ts`).
 */
import type {
  IdeaTakes,
  IdeaTakeSnapshot,
  RedoPorts,
} from "@some-ui/soundbites"
import type { BundleTakes } from "@some-ui/voice-capture"
import { ONE_TAKE } from "@some-ui/voice-capture"

import type { DeskSnapshot, PhoneTakes } from "@/lib/takes-desk"
import { patternDesk, takesDesk } from "@/lib/takes-desk"
import { voiceMarks } from "@/lib/voice-marks"

export type { Take as IdeaTake } from "@/lib/takes-desk"

/** A spoken answer runs up to a minute, as a Jobs note does. */
const MAX_MS = 60_000
const MAX = 40

const desk = takesDesk({
  key: "some-ui:idea-takes",
  screen: "studio.idea-answers",
  // The kit's desk: no Let go.
  from: null,
  dbName: "some-ui.idea-takes",
  limits: { max: MAX, maxMs: MAX_MS },
})

/** A new idea's answers (ST26): each waits on the phone until it is sent. */
const bundleDesk = patternDesk({
  key: "some-ui:idea-bundle-takes",
  screen: "studio.new-idea",
  // A take here is let go only by a new idea's Delete, Redo or clean-up
  // before Send, for good, and only while it waits. Once sent, it is set
  // aside only when an answer said again replaces it (`setAsideReplaced`),
  // its mark owed as a Studio note's (LA13).
  from: "studio",
  dbName: "some-ui.idea-bundle-takes",
  limits: { max: MAX, maxMs: MAX_MS },
  shape: { ...ONE_TAKE, send: "on-confirm" },
})

/**
 * An answer of an idea already on home, said again (ST26, #2579): each
 * take waits on the phone until the idea is sent again, on a desk of its
 * own, which a new idea's bundle never opens, so its clean-up of a kept
 * idea's takes never reaches one. Each goes home as a new idea's does
 * (`idea:<idea>:<question>`).
 */
const redoDesk = patternDesk({
  key: "some-ui:idea-redo-takes",
  screen: "studio.idea-say-again",
  // As the new idea's desk: deleted for good only while it waits; once
  // sent, set aside only when a later take said again replaces it (LA13).
  from: "studio",
  dbName: "some-ui.idea-redo-takes",
  limits: { max: MAX, maxMs: MAX_MS },
  shape: { ...ONE_TAKE, send: "on-confirm" },
})

export function sweepIdeaTakes(): void {
  desk.sweep()
  bundleDesk.sweep()
  redoDesk.sweep()
}
/** The desks, for the copy home (`lib/home-link/voice-copy`). */
export const ideaTakesDesk = desk
export const ideaBundleDesk = bundleDesk
export const ideaRedoDesk = redoDesk

/** The phone's desk of a new idea's takes, as its screen uses it (ST26). */
export const ideaBundleTakes = (): BundleTakes => bundleDesk.phone()

/**
 * Sets aside on home each take `ids` names, at `at`: the takes answers
 * said again replace, once their idea is sent again (#2579). One an idea
 * desk lists is set aside there, its mark owed (`setAsideSent`); one no
 * desk lists any more (it left the phone once home held it) is owed its
 * mark alone, which goes once home holds the note. Says whether every one
 * was.
 */
export function setAsideReplaced(
  ids: ReadonlyArray<string>,
  at: string
): boolean {
  return ids
    .map((id) => {
      const listed = [bundleDesk, redoDesk].reduce<boolean | "absent">(
        (done, each) => (done === "absent" ? each.setAsideSent(id, at) : done),
        "absent"
      )
      return listed === "absent" ? voiceMarks.owe(id, at, "studio") : listed
    })
    .every(Boolean)
}

/** The phone's desk of answers said again, as Ideas on home uses it (#2579). */
export const ideaRedoTakes = (): RedoPorts => ({
  takes: redoDesk.phone(),
  setAside: (ids) => setAsideReplaced(ids, new Date().toISOString()),
})

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
