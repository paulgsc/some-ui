/**
 * A pull resyncs with home (PULL3, the owner's D1 on #2456): every lane the
 * app shell drains (`./lanes`) is asked for a run, as Send now asks, so what
 * waits goes and home's record is read again, and the pull hears how each
 * run ended. Unpaired, or with the app not in front, nothing is asked and
 * the pull has nothing to say of home (`pullKept`; LA15).
 *
 * Each run ends in its lane's runtime (`./kept-runtime`), so the marks that
 * read it (the header's, Settings') show how the pull went, lane by lane;
 * the pull itself says only whether all of them got in step.
 */
import type { Refresher } from "@/lib/pull-refresh/refreshers"

import { resynced } from "./kept-model"
import type { Kept } from "./kept-runtime"
import { pullKept } from "./kept-watch"
import { PULL_HOME } from "./words"

/** Home as a pull reads it again: every lane `watched` names at that moment. */
export function homeRefresher(
  watched: () => Iterable<Kept>,
  doc: Pick<Document, "visibilityState">
): Refresher {
  return {
    what: PULL_HOME.what,
    checkAgain: () =>
      Promise.all(Array.from(watched(), (lane) => pullKept(lane, doc))).then(
        (ends) => {
          if (ends.some((end) => end !== null && !resynced(end))) {
            throw new Error("a lane did not get in step with home")
          }
        }
      ),
  }
}
