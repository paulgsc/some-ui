// ── PreviewCard ───────────────────────────────────────────────────────────────
// State-driven "Live Drama Card" — the reward center. No DOM querying, no
// innerHTML wipes of unrelated content; render() rebuilds only the card body
// from the current JournalDraft.

import type { JournalDraft } from "@drama/components/form-opinionated/use-drama-journal-state"
import { el } from "@drama/effects/content/dom"

const TAG_LABELS: Record<string, string> = {
  confession: "Confession",
  reunion: "Reunion",
  betrayal: "Betrayal",
  sacrifice: "Sacrifice",
  separation: "Separation",
  kiss: "First Kiss",
  rivalry: "Rivalry",
  other: "Family Conflict",
}

export function buildPreviewCard(value: JournalDraft): {
  root: HTMLDivElement
  render: (next: JournalDraft) => void
} {
  const root = el("div", "dj-preview-card flex flex-col gap-3")

  const render = (draft: JournalDraft): void => {
    root.innerHTML = ""

    const titleText = draft.title.trim() || "Untitled Drama"
    const epText = draft.episode ? `Episode ${draft.episode}` : "Exp. Episode"

    const metaLine = el("div", "card-meta-line")
    metaLine.textContent = `${titleText} — ${epText}`
    root.appendChild(metaLine)

    const before = draft.transition.before.trim()
    const after = draft.transition.after.trim()
    if (before || after) {
      const transLine = el("div", "card-transitions-line")
      transLine.textContent = `${before || "?"} → ${after || "?"}`
      root.appendChild(transLine)
    }

    if (draft.tags.length > 0) {
      const chipsLine = el("div", "card-chips-line flex flex-wrap gap-1.5")
      draft.tags.forEach((tag) => {
        const chip = el("span", "card-chip")
        chip.textContent = TAG_LABELS[tag] ?? tag
        chipsLine.appendChild(chip)
      })
      root.appendChild(chipsLine)
    }

    const starsLine = el("div", "card-stars-line")
    const fullStars = Math.round(draft.rating / 2)
    starsLine.textContent = "★".repeat(fullStars) + "☆".repeat(5 - fullStars)
    root.appendChild(starsLine)

    if (!before && !after && draft.tags.length === 0 && !draft.title.trim()) {
      const hint = el("div", "card-empty-hint")
      hint.textContent = "Your story will appear here as you write…"
      root.appendChild(hint)
    }
  }

  render(value)

  return { root, render }
}
