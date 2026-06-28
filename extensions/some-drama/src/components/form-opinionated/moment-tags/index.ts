// ── MomentTagsSection ─────────────────────────────────────────────────────────
// Owns: chip-based tag selector. Converts the old checkbox grid into chips
// with selection state + shimmer feedback on activation.

import { el } from "@drama/lib/content/utils"
import type { MomentTag } from "@drama/types"

import type { JournalDraft } from "../use-drama-journal-state"

const ALL_TAGS: ReadonlyArray<MomentTag> = [
  "confession",
  "reunion",
  "betrayal",
  "sacrifice",
  "separation",
  "kiss",
  "rivalry",
  "other",
]

const TAG_LABELS: Record<MomentTag, string> = {
  confession: "Confession",
  reunion: "Reunion",
  betrayal: "Betrayal",
  sacrifice: "Sacrifice",
  separation: "Separation",
  kiss: "First Kiss",
  rivalry: "Rivalry",
  other: "Family Conflict",
  handTouch: "Hand Touch",
  jealousy: "Jealousy",
  misunderstanding: "Misunderstanding",
  reveal: "Reveal",
  argument: "Argument",
  goodbye: "Goodbye",
  promise: "Promise",
}

export function buildMomentTagsSection(
  value: Pick<JournalDraft, "tags">,
  onChange: (patch: Partial<JournalDraft>) => void
): { root: HTMLDivElement } {
  const root = el("div", "dj-section")

  const prompt = el("label", "dj-prompt")
  prompt.textContent = "What happened in this episode?"
  root.appendChild(prompt)

  const grid = el("div", "dj-tag-grid flex flex-wrap gap-2")
  const selected = new Set<MomentTag>(value.tags)

  ALL_TAGS.forEach((tag) => {
    const chip = el("button", "dj-tag-chip")
    chip.type = "button"
    chip.textContent = TAG_LABELS[tag]
    chip.classList.toggle("dj-tag-selected", selected.has(tag))

    chip.addEventListener("click", () => {
      if (selected.has(tag)) {
        selected.delete(tag)
      } else {
        selected.add(tag)
        chip.classList.add("dj-tag-shimmer")
        chip.addEventListener(
          "animationend",
          () => chip.classList.remove("dj-tag-shimmer"),
          { once: true }
        )
      }
      chip.classList.toggle("dj-tag-selected", selected.has(tag))
      onChange({ tags: Array.from(selected) })
    })

    grid.appendChild(chip)
  })

  root.appendChild(grid)

  return { root }
}
