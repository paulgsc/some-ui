/**
 * Builds the Drama Journal Authoring UI v3 — "Strawberry Moon".
 *
 * Replaces the v2 single-column god file. State is centralized in
 * useDramaJournalState (createJournalState); every sub-component is a
 * pure value/onChange consumer. PreviewCard re-renders via subscribe(),
 * not DOM querying or innerHTML wipes of unrelated content.
 *
 * Accordion sections (one open at a time):
 *   What Happened?   — MomentTagsSection
 *   What Changed?    — TransitionEditor
 *   Why Did It Matter? — ReflectionEditor + QuoteCapture
 *   Advanced Metrics — AdvancedMetrics
 *
 * EpisodeHeader and PreviewCard are always visible (not accordioned).
 */

import type { DramaEntry } from "@drama/types"

import { buildAccordionGroup } from "./accordion"
import { buildAdvancedMetrics } from "./advanced-metrics"
import { buildEpisodeHeader } from "./episode-header"
import { buildMomentTagsSection } from "./moment-tags"
import { buildPreviewCard } from "./preview-card"
import { buildQuoteCapture } from "./quote-capture"
import { buildReflectionEditor } from "./reflection-editor"
import { buildTransitionEditor } from "./transition-editor"
import { createJournalState } from "./use-drama-journal-state"
import type { OpinionatedFieldRefs } from "./use-drama-journal-state"

export type { OpinionatedFieldRefs } from "./use-drama-journal-state"

export function buildOpinionatedSection(prefill: Partial<DramaEntry>): {
  root: HTMLElement
  refs: OpinionatedFieldRefs
} {
  const state = createJournalState(prefill)
  const draft = state.get()

  const root = document.createElement("div")
  root.className = "dj-authoring-container"
  const notebook = document.createElement("div")
  notebook.className = "dj-notebook flex flex-col gap-3.5"
  root.appendChild(notebook)

  // ── Episode header (always visible) ────────────────────────────────────────
  const { root: headerRoot } = buildEpisodeHeader(draft, state.set)
  notebook.appendChild(headerRoot)

  // ── Accordion sections ───────────────────────────────────────────────────────
  const { root: tagsRoot } = buildMomentTagsSection(draft, state.set)
  const { root: transitionRoot } = buildTransitionEditor(draft, state.set)

  const reflectionWrap = document.createElement("div")
  const { root: reflectionRoot } = buildReflectionEditor(draft, state.set)
  const { root: quoteRoot } = buildQuoteCapture(draft, state.set)
  reflectionWrap.appendChild(reflectionRoot)
  reflectionWrap.appendChild(quoteRoot)

  const { root: advancedRoot } = buildAdvancedMetrics(draft, state.set)

  const { root: accordionRoot } = buildAccordionGroup([
    { title: "What Happened?", body: tagsRoot },
    { title: "What Changed?", body: transitionRoot },
    { title: "Why Did It Matter?", body: reflectionWrap },
    { title: "Advanced Metrics", body: advancedRoot },
  ])
  notebook.appendChild(accordionRoot)

  // ── Preview card (always visible, state-driven) ─────────────────────────────
  const previewSection = document.createElement("div")
  previewSection.className = "dj-section dj-preview-section"
  const previewLabel = document.createElement("div")
  previewLabel.className = "dj-section-label"
  previewLabel.textContent = "Preview Card"
  previewSection.appendChild(previewLabel)

  const { root: previewRoot, render: renderPreview } = buildPreviewCard(draft)
  previewSection.appendChild(previewRoot)
  notebook.appendChild(previewSection)

  // Re-render preview on every state change — no DOM querying involved.
  state.subscribe(renderPreview)

  return { root, refs: state.refs }
}
