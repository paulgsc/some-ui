// ── useDramaJournalState ─────────────────────────────────────────────────────
// Single source of truth for the v3 authoring form. All sub-components
// receive `value` + `onChange`; nothing reads the DOM for data.
//
// The exposed `refs` shape MUST match what popup-renderer/index.ts calls:
//   getRating(), getLikelihood(), getQuote(), getOverallProgress(),
//   getAxes(), getTransition(), getTags(), getPeakLine(), getMomentum()
//
// NOTE on contract drift fix: the prior file exposed getTransitions()
// (plural, array) and getRating() * 2 (denormalized). popup-renderer calls
// getTransition() (singular) and getAxes()/getPeakLine()/getMomentum(), which
// did not exist before. This file defines the contract popup-renderer
// actually consumes — DramaEntryOpinionated's shape, unmodified.

import type { DramaEntry, DramaEntryOpinionated, MomentTag } from "@drama/types"

export type JournalDraft = {
  // Episode header
  title: string
  episode: number
  watchDate: string

  // What happened
  tags: Array<MomentTag>

  // What changed
  transition: DramaEntryOpinionated["transition"]

  // Why it mattered
  reflection: string

  // Memorable quote
  quote: string

  // Advanced
  rating: number // 0-10, matches DramaEntry.rating directly
  momentum: DramaEntryOpinionated["momentum"]
  completionLikelihood: number // 0-1
  axes: DramaEntryOpinionated["axes"]
  peakLine: string
  currentEpisode: number
  totalEpisodes: number
}

export type OpinionatedFieldRefs = {
  getRating: () => number
  getLikelihood: () => number
  getQuote: () => string
  getOverallProgress: () => number
  getAxes: () => DramaEntryOpinionated["axes"]
  getTransition: () => DramaEntryOpinionated["transition"]
  getTags: () => Array<MomentTag>
  getPeakLine: () => string
  getMomentum: () => DramaEntryOpinionated["momentum"]
}

const DEFAULT_AXES: DramaEntryOpinionated["axes"] = {
  connection: 0,
  hope: 0,
  trust: 0,
  control: 0,
}

const DEFAULT_TRANSITION: DramaEntryOpinionated["transition"] = {
  before: "",
  after: "",
}

const DEFAULT_MOMENTUM: DramaEntryOpinionated["momentum"] = {
  value: 50,
  direction: "steady",
}

export function defaultDraft(prefill: Partial<DramaEntry>): JournalDraft {
  return {
    title: prefill.title ?? "",
    episode: prefill.episode ? Number(prefill.episode) || 0 : 0,
    watchDate: new Date().toISOString().split("T")[0] ?? "",

    tags: prefill.tags ?? [],

    transition: prefill.transition ?? DEFAULT_TRANSITION,

    reflection: prefill.note ?? "",

    quote: prefill.featuredQuote ?? "",

    rating: prefill.rating ?? 0,
    momentum: prefill.momentum ?? DEFAULT_MOMENTUM,
    completionLikelihood: prefill.completionLikelihood ?? 0.5,
    axes: prefill.axes ?? DEFAULT_AXES,
    peakLine: prefill.peakLine ?? "",
    currentEpisode: prefill.episode ? Number(prefill.episode) || 0 : 0,
    totalEpisodes: 16,
  }
}

export type JournalStateController = {
  get: () => JournalDraft
  /** Apply a partial patch and notify all subscribers. */
  set: (patch: Partial<JournalDraft>) => void
  /** Subscribe to draft changes — returns unsubscribe fn. */
  subscribe: (fn: (draft: JournalDraft) => void) => () => void
  refs: OpinionatedFieldRefs
}

export function createJournalState(
  prefill: Partial<DramaEntry>
): JournalStateController {
  let draft = defaultDraft(prefill)
  const subscribers = new Set<(draft: JournalDraft) => void>()

  const get = (): JournalDraft => draft

  const set = (patch: Partial<JournalDraft>): void => {
    draft = { ...draft, ...patch }
    subscribers.forEach((fn) => fn(draft))
  }

  const subscribe = (fn: (draft: JournalDraft) => void): (() => void) => {
    subscribers.add(fn)
    return () => subscribers.delete(fn)
  }

  const refs: OpinionatedFieldRefs = {
    getRating: () => draft.rating,
    getLikelihood: () => draft.completionLikelihood,
    getQuote: () => draft.quote.trim(),
    getOverallProgress: () => {
      const total = draft.totalEpisodes || 1
      return draft.currentEpisode / total
    },
    getAxes: () => draft.axes,
    getTransition: () => ({
      before: draft.transition.before.trim(),
      after: draft.transition.after.trim(),
    }),
    getTags: () => draft.tags,
    getPeakLine: () => draft.peakLine.trim(),
    getMomentum: () => draft.momentum,
  }

  return { get, set, subscribe, refs }
}
