// ── EpisodeHeader ─────────────────────────────────────────────────────────────
// Owns: title / episode number / watch date inputs.
// Parent supplies value + onChange; no internal state.

import type { JournalDraft } from "@drama/components/form-opinionated/use-drama-journal-state"
import { el } from "@drama/lib/content/utils"

export type EpisodeHeaderRefs = {
  titleInput: HTMLInputElement
  epInput: HTMLInputElement
}

export function buildEpisodeHeader(
  value: Pick<JournalDraft, "title" | "episode" | "watchDate">,
  onChange: (patch: Partial<JournalDraft>) => void
): { root: HTMLDivElement; refs: EpisodeHeaderRefs } {
  const root = el("div", "dj-episode-header")

  const titleInput = el("input", "dj-input-text dj-meta-title")
  titleInput.type = "text"
  titleInput.placeholder = "Drama Title"
  titleInput.value = value.title
  titleInput.addEventListener("input", () => {
    onChange({ title: titleInput.value })
  })

  const epInput = el("input", "dj-input-text dj-meta-ep")
  epInput.type = "number"
  epInput.placeholder = "Ep #"
  epInput.value = value.episode ? String(value.episode) : ""
  epInput.addEventListener("input", () => {
    const n = Number(epInput.value) || 0
    onChange({ episode: n, currentEpisode: n })
  })

  const dateInput = el("input", "dj-input-text dj-meta-date")
  dateInput.type = "date"
  dateInput.value = value.watchDate
  dateInput.addEventListener("input", () => {
    onChange({ watchDate: dateInput.value })
  })

  root.appendChild(titleInput)
  root.appendChild(epInput)
  root.appendChild(dateInput)

  return { root, refs: { titleInput, epInput } }
}
