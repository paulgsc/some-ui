// ── TransitionEditor ─────────────────────────────────────────────────────────
// Owns: before/after "emotional state card" pair. Single transition only
// (DramaEntryOpinionated.transition is singular — matches popup-renderer's
// getTransition() contract). No querySelectorAll, no row-array.

import { el } from "@drama/lib/content/utils"

import type { JournalDraft } from "../use-drama-journal-state"

export function buildTransitionEditor(
  value: Pick<JournalDraft, "transition">,
  onChange: (patch: Partial<JournalDraft>) => void
): { root: HTMLDivElement } {
  const root = el("div", "dj-section dj-transitions-section")

  const prompt = el("label", "dj-prompt")
  prompt.textContent = "What changed?"
  root.appendChild(prompt)

  const container = el("div", "dj-transitions-container flex flex-col gap-3.5")
  const row = el("div", "dj-transition-row flex items-center gap-3.5")

  const beforeCard = el("div", "dj-state-card")
  beforeCard.contentEditable = "true"
  beforeCard.dataset.placeholder = "Before"
  beforeCard.textContent = value.transition.before

  const arrow = el("span", "dj-trans-arrow")
  arrow.textContent = "↓"

  const afterCard = el("div", "dj-state-card")
  afterCard.contentEditable = "true"
  afterCard.dataset.placeholder = "After"
  afterCard.textContent = value.transition.after

  const emit = (): void => {
    onChange({
      transition: {
        before: beforeCard.textContent ?? "",
        after: afterCard.textContent ?? "",
      },
    })
  }

  beforeCard.addEventListener("input", emit)
  afterCard.addEventListener("input", emit)

  row.appendChild(beforeCard)
  row.appendChild(arrow)
  row.appendChild(afterCard)
  container.appendChild(row)
  root.appendChild(container)

  return { root }
}
