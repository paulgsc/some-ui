/**
 * Facts → the flight recorder (BC5, #1438).
 *
 * Core and the Sensor describe what happened as `CoreFact` values (B6);
 * this is the one place those values become calls on `BoyoObservability`.
 * A fact with no recorder live is dropped, exactly as every
 * `observability()?.…` call site used to.
 */

import type { CoreFact } from "@censor/lib/content/core/actions"
import { observability } from "@censor/lib/content/observability"
import { assertNever } from "@some-extension/common"

export function recordFact(fact: CoreFact): void {
  const obs = observability()
  if (obs === null) return
  const { kind } = fact
  switch (kind) {
    case "session.start": {
      obs.sessionStart(fact.session)
      break
    }
    case "session.reset": {
      obs.sessionReset(fact.session)
      break
    }
    case "navigation": {
      obs.navigation()
      break
    }
    case "mutation.batch": {
      obs.mutationBatch(fact.candidates)
      break
    }
    case "mount.resolved": {
      obs.mountResolved(fact.videoId)
      break
    }
    case "mount.provisional": {
      obs.mountProvisional(fact.videoId)
      break
    }
    case "mount.queued": {
      obs.queued(`t:${fact.tag}`)
      break
    }
    case "mount.rejected": {
      obs.rejected(`t:${fact.tag}`)
      break
    }
    case "entry.state": {
      obs.entryState(fact.state, fact.videoId)
      break
    }
    case "channel.backfilled": {
      obs.channelBackfilled(fact.videoId)
      break
    }
    case "channel.abandoned": {
      obs.channelAbandoned(fact.videoId)
      break
    }
    case "stale.discarded": {
      obs.staleDiscarded(fact.videoId)
      break
    }
    case "churn.ignored": {
      obs.churnIgnored(fact.videoId)
      break
    }
    case "recycled": {
      // A recycle is visible as the old key's unmount and the new key's
      // mount; nothing further to record.
      break
    }
    case "bulk.advance": {
      // Completed by the runtime, which adds the DOM census the Sensor owns
      // (see runtime.ts); recorded there, not here.
      break
    }
    case "shape.unknown": {
      obs.unknownShape(fact.tag, fact.surface, fact.reason)
      break
    }
    case "date.observed": {
      obs.uploadDate(fact.raw, fact.surface, fact.renderer)
      break
    }
    default: {
      kind satisfies never
      return assertNever(kind)
    }
  }
}
