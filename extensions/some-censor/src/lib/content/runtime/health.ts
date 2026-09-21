/**
 * The health cadence (BC5, #1438) — what the former manager did for the
 * invariants in `observability.ts`, over the new pipeline's state.
 *
 * Three things fed the invariants: the queue census (the Sensor's now), the
 * cards mid-mount (Core's `pending` channels now: a card is rendered the
 * instant it is observed, so the only thing that can stall is the whitelist
 * round trip), and what the occluder is hiding with nothing coming for it
 * (the Sensor's `census().occluded`, timestamped here so a card legitimately
 * mid-adoption is not called stranded). The schedule is the one the
 * `#1425` review settled on: a standing occlusion watch at
 * `OCCLUSION_GRACE_MS`, a stall watch while anything is pending, and a
 * throttled sample on every mutation batch.
 */

import type { CoreState } from "@censor/lib/content/core/state"
import type {
  BoyoContext,
  OccludedCard,
} from "@censor/lib/content/observability"
import {
  observability,
  OCCLUSION_GRACE_MS,
  PROMOTION_STALL_MS,
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
  /** A session started: take a reading now (see `_occlusionReading`). */
  sessionStarted(): void
  /** Core state changed; re-arm the stall watch if anything is pending. */
  stateChanged(): void
  /** Build the context the invariants evaluate — also the bulk-advance census. */
  context(): BoyoContext
  stop(): void
}

export function createHealth(ports: HealthPorts): Health {
  const occludedSince = new Map<HTMLElement, number>()
  let occlusionWatch: ReturnType<typeof setTimeout> | null = null
  let stallWatch: ReturnType<typeof setTimeout> | null = null
  let occludedLastReading = false
  let running = false

  function occlusionCensus(now: number): Array<OccludedCard> {
    const live = new Set<HTMLElement>()
    const out: Array<OccludedCard> = []
    for (const el of ports.census().occluded) {
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
      channelPending: [...state.cards.values()]
        .filter((c) => c.channel.kind === "unknown")
        .map((c) => ({
          key: `c:${c.key}`,
          firstSeenAt: c.firstSeenAt,
          videoShaped: false,
        })),
      promoting: [...state.cards.values()]
        .filter((c) => c.channel.kind === "pending")
        .map((c) => ({
          key: c.key,
          startedAt: c.channel.kind === "pending" ? c.channel.since : now,
        })),
      occluded: occlusionCensus(now),
    }
  }

  function sample(): void {
    const obs = observability()
    if (obs) void obs.sampleHealth(context())
  }

  function reading(force: boolean): void {
    const occluded = occlusionCensus(ports.clock()).length > 0
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

  function armStallWatch(): void {
    if (stallWatch !== null || !running) return
    stallWatch = setTimeout(() => {
      stallWatch = null
      const pending = [...ports.state().cards.values()].some(
        (c) => c.channel.kind === "pending"
      )
      if (!pending) return
      sample()
      armStallWatch()
    }, PROMOTION_STALL_MS)
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
    stateChanged(): void {
      if (!running) return
      const pending = [...ports.state().cards.values()].some(
        (c) => c.channel.kind === "pending"
      )
      if (pending) armStallWatch()
    },
    context,
    stop(): void {
      running = false
      if (occlusionWatch !== null) clearTimeout(occlusionWatch)
      if (stallWatch !== null) clearTimeout(stallWatch)
      occlusionWatch = null
      stallWatch = null
      occludedSince.clear()
      occludedLastReading = false
    },
  }
}
