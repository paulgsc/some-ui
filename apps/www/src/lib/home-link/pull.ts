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
 * the pull itself says only whether all of them got in step.
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

/** Home as a pull reads it again: every lane `watched` names, one at a time. */
export function homeRefresher({
  watched,
  doc,
  free = linkFree,
}: HomePullPorts): Refresher {
  const pullLane = async (lane: Kept): Promise<KeptRun | null> => {
    const end = await pullKept(lane, doc)
    if (end?.kind !== "busy") return end
    await free()
    // Its screens may have gone while it waited (aph's).
    return watched().has(lane) ? pullKept(lane, doc) : null
  }
  return {
    what: PULL_HOME.what,
    checkAgain: async (): Promise<void> => {
      let short = false
      for (const lane of Array.from(watched())) {
        if (!watched().has(lane)) continue
        const end = await pullLane(lane)
        if (end !== null && !resynced(end)) short = true
      }
      if (short) throw new Error("a lane did not get in step with home")
    },
  }
}
