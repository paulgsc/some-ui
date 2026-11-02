/**
 * A pull resyncs with home (PULL3, the owner's D1 on #2456): every lane the
 * app shell drains (`./lanes`) is asked for a run, as Send now asks, so what
 * waits goes and home's record is read again, and the pull hears how each
 * run ended. Unpaired, or with the app not in front, nothing is asked and
 * the pull has nothing to say of home (`pullKept`; LA15).
 *
 * The lanes share the link, which runs one of them at a time and turns the
 * rest away, so they are asked one after another; a lane turned away all
 * the same (its watch, or a tap in Settings, had the link) is asked once
 * more when the link frees up, the moment its watch asks it again too.
 *
 * Each run ends in its lane's runtime (`./kept-runtime`), so the marks that
 * read it (the header's, Settings') show how the pull went, lane by lane;
 * the pull itself says only whether all of them got in step. A screen that
 * shows one lane hears that lane's end in the same pull (`ended`; Jobs'
 * morning run, PULL2) and names it in its own words.
 */
import type { Refresher } from "@/lib/pull-refresh/refreshers"

import { homeLink } from "./index"
import type { KeptRun } from "./kept-model"
import { resynced } from "./kept-model"
import type { Kept } from "./kept-runtime"
import type { Front } from "./kept-watch"
import { pullKept } from "./kept-watch"
import { PULL_HOME } from "./words"

export type HomePullPorts = {
  /** The lanes `useLaneHome` watches now. */
  readonly watched: () => ReadonlySet<Kept>
  readonly doc: Front
  /** Resolves once the link is doing nothing. */
  readonly free?: () => Promise<void>
}

/** Resolves once the home link is doing nothing. */
function linkFree(): Promise<void> {
  const link = homeLink()
  return new Promise((resolve) => {
    const idle = (): boolean => link.getSnapshot().activity.kind === "idle"
    if (idle()) {
      resolve()
      return
    }
    const stop = link.subscribe(() => {
      if (!idle()) return
      stop()
      resolve()
    })
  })
}

/** Home as a pull reads it again, and each lane's end in that pull. */
export type HomeRefresher = Refresher & {
  /**
   * How `lane`'s run in the pull under way ended, starting that pull if
   * none is out (the refresher's own ask in the same pull joins it); null
   * when the pull asked nothing of it.
   */
  readonly ended: (lane: Kept) => Promise<KeptRun | null>
}

/** Home as a pull reads it again: every lane `watched` names, one at a time. */
export function homeRefresher({
  watched,
  doc,
  free = linkFree,
}: HomePullPorts): HomeRefresher {
  const pullLane = async (lane: Kept): Promise<KeptRun | null> => {
    const end = await pullKept(lane, doc)
    if (end?.kind !== "busy") return end
    await free()
    // Its screens may have gone while it waited (aph's).
    return watched().has(lane) ? pullKept(lane, doc) : null
  }
  /** Each lane's end in the pull still out; null once it is done. */
  let out: ReadonlyMap<Kept, Promise<KeptRun | null>> | null = null
  const pull = (): ReadonlyMap<Kept, Promise<KeptRun | null>> => {
    if (out !== null) return out
    const ends = new Map<Kept, Promise<KeptRun | null>>()
    let turn: Promise<void> = Promise.resolve()
    for (const lane of Array.from(watched())) {
      const end = turn.then(() => (watched().has(lane) ? pullLane(lane) : null))
      ends.set(lane, end)
      turn = end.then(
        () => undefined,
        () => undefined
      )
    }
    out = ends
    void turn.then(() => {
      if (out === ends) out = null
    })
    return ends
  }
  return {
    what: PULL_HOME.what,
    checkAgain: async (): Promise<void> => {
      const ends = await Promise.all(pull().values())
      if (ends.some((end) => end !== null && !resynced(end))) {
        throw new Error("a lane did not get in step with home")
      }
    },
    ended: (lane) => pull().get(lane) ?? Promise.resolve(null),
  }
}
