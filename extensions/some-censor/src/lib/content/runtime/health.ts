/**
 * The health cadence (BC5, #1438): when the invariants in `observability.ts`
 * are sampled, and the context they are sampled over.
 *
 * Two things feed the invariants: the Sensor's queue census, and what the
 * occluder is hiding with nothing coming for it (the Sensor's
 * `census().occluded`, timestamped here so a card legitimately mid-adoption
 * is not called stranded). A sample is taken when the runtime starts, on a
 * throttled mutation batch, and by a standing occlusion watch at
 * `OCCLUSION_GRACE_MS`.
 */

import type { CoreState } from "@censor/lib/content/core/state"
import type {
  BoyoContext,
  OccludedCard,
} from "@censor/lib/content/observability"
import {
  observability,
  OCCLUSION_GRACE_MS,
} from "@censor/lib/content/observability"
import { classifyCard } from "@censor/lib/content/selectors"
import { RESOLVE_BUDGET_MS } from "@censor/lib/content/sensor/queue"
import type { SensorCensus } from "@censor/lib/content/sensor/sensor"

export type HealthPorts = {
  readonly clock: () => number
  readonly state: () => CoreState
  readonly census: () => SensorCensus
}

export type Health = {
  /** A mutation batch happened; sample if the throttle allows. */
  tick(): void
  /** A session started: take a reading now (`reading(true)`). */
  sessionStarted(): void
  stop(): void
}

export function createHealth(ports: HealthPorts): Health {
  const occludedSince = new Map<HTMLElement, number>()
  let occlusionWatch: ReturnType<typeof setTimeout> | null = null
  let occludedLastReading = false
  let running = false

  function occlusionCensus(
    now: number,
    occluded: ReadonlyArray<HTMLElement>
  ): Array<OccludedCard> {
    const live = new Set<HTMLElement>()
    const out: Array<OccludedCard> = []
    for (const el of occluded) {
      live.add(el)
      let since = occludedSince.get(el)
      if (since === undefined) {
        since = now
        occludedSince.set(el, since)
      }
      out.push({ tag: el.tagName.toLowerCase(), sinceAt: since })
    }
    for (const el of occludedSince.keys()) {
      if (!live.has(el)) occludedSince.delete(el)
    }
    return out
  }

  function context(): BoyoContext {
    const now = ports.clock()
    const state = ports.state()
    const census = ports.census()
    return {
      now,
      phase: state.phase,
      resolveBudgetMs: RESOLVE_BUDGET_MS,
      unresolved: census.unresolved.map(({ el, firstSeenAt }) => ({
        key: `t:${el.tagName.toLowerCase()}`,
        firstSeenAt,
        videoShaped: classifyCard(el) === "card",
      })),
      channelPending: census.channelPending.map(({ el, firstSeenAt }) => ({
        key: `c:${el.tagName.toLowerCase()}`,
        firstSeenAt,
        videoShaped: false,
      })),
      occluded: occlusionCensus(now, census.occluded),
    }
  }

  function sample(): void {
    const obs = observability()
    if (obs) void obs.sampleHealth(context())
  }

  function reading(force: boolean): void {
    const occluded =
      occlusionCensus(ports.clock(), ports.census().occluded).length > 0
    const was = occludedLastReading
    occludedLastReading = occluded
    if (!force && !occluded && !was) return
    sample()
  }

  function armOcclusionWatch(): void {
    if (occlusionWatch !== null || !running) return
    occlusionWatch = setTimeout(() => {
      occlusionWatch = null
      if (!running) return
      armOcclusionWatch()
      reading(false)
    }, OCCLUSION_GRACE_MS)
  }

  return {
    tick(): void {
      const obs = observability()
      if (!obs) return
      const now = ports.clock()
      if (!obs.shouldSampleHealth(now)) return
      void obs.sampleHealth(context())
    },
    sessionStarted(): void {
      running = true
      occludedSince.clear()
      occludedLastReading = false
      armOcclusionWatch()
      reading(true)
    },
    stop(): void {
      running = false
      if (occlusionWatch !== null) clearTimeout(occlusionWatch)
      occlusionWatch = null
      occludedSince.clear()
      occludedLastReading = false
    },
  }
}
