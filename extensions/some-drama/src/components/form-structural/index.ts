
/**
 *
 * Builds the structural (factual / scrapable) section of the entry form.
 * Concern: title, episode, network, year, genre, note, color, poster, timestamp.
 * No opinionated / mood fields here.
 */

import { ACCENT_COLORS } from "@drama/lib/popup/constants"
import type { DramaEntry } from "@drama/types"

type El = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string
) => HTMLElementTagNameMap[K]

export type StructuralFieldRefs = {
  titleInput: HTMLInputElement
  episodeInput: HTMLInputElement
  networkInput: HTMLInputElement
  yearInput: HTMLInputElement
  genreInput: HTMLInputElement
  noteInput: HTMLInputElement
  getColor: () => string
}

export function buildStructuralSection(
  el: El,
  prefill: Partial<DramaEntry>
): { root: HTMLElement; refs: StructuralFieldRefs } {
  const root = el("div", "pf-structural")

  // ── Telemetry badge bar ────────────────────────────────────────────────────
  if (prefill.timestamp || prefill.progress) {
    const bar = el("div", "p-telemetry-badge-bar")
    bar.innerHTML = `
      <span class="p-tbadge">⏱️ ${prefill.timestamp || "00:00"}</span>
      <span class="p-tbadge">📈 ${Math.round((prefill.progress || 0) * 100)}%</span>
      <span class="p-tbadge">${prefill.isPlaying ? "🟢 Live" : "⏸ Paused"}</span>
    `
    root.appendChild(bar)
  }

  // ── Title (full width) ─────────────────────────────────────────────────────
  const titleGroup = el("div", "p-field")
  const titleLabel = el("label", "p-label")
  titleLabel.textContent = "Title *"
  const titleInput = el("input", "p-input")
  titleInput.id = "pf-title"
  titleInput.value = prefill.title || ""
  titleInput.placeholder = "e.g., Love Between Fairy and Devil"
  titleGroup.appendChild(titleLabel)
  titleGroup.appendChild(titleInput)
  root.appendChild(titleGroup)

  // ── 2-col grid: episode / network / year / genre ───────────────────────────
  const grid = el("div", "p-form-grid")

  const gridField = (lbl: string, id: string, val = "", ph = "") => {
    const grp = el("div", "p-field")
    const l = el("label", "p-label")
    l.textContent = lbl
    const inp = el("input", "p-input")
    inp.id = `pf-${id}`
    inp.value = val
    inp.placeholder = ph
    grp.appendChild(l)
    grp.appendChild(inp)
    return { grp, inp }
  }

  const { grp: epGrp, inp: episodeInput } = gridField(
    "Episode",
    "episode",
    prefill.episode ?? "",
    "Ep 12"
  )
  const { grp: netGrp, inp: networkInput } = gridField(
    "Network",
    "network",
    prefill.network ?? "",
    "tvN"
  )
  const { grp: yrGrp, inp: yearInput } = gridField(
    "Year",
    "year",
    prefill.year ?? "",
    "2024"
  )
  const { grp: genreGrp, inp: genreInput } = gridField(
    "Genre",
    "genre",
    prefill.genre ?? "",
    "Xianxia, Fantasy"
  )

  grid.appendChild(epGrp)
  grid.appendChild(netGrp)
  grid.appendChild(yrGrp)
  grid.appendChild(genreGrp)
  root.appendChild(grid)

  // ── Note (full width) ──────────────────────────────────────────────────────
  const noteGroup = el("div", "p-field")
  const noteLabel = el("label", "p-label")
  noteLabel.textContent = "Notes"
  const noteInput = el("input", "p-input")
  noteInput.id = "pf-note"
  noteInput.value = prefill.note ?? ""
  noteInput.placeholder = "Context, reminders…"
  noteGroup.appendChild(noteLabel)
  noteGroup.appendChild(noteInput)
  root.appendChild(noteGroup)

  // ── Color picker ───────────────────────────────────────────────────────────
  const colorGroup = el("div", "p-field")
  const colorLabel = el("label", "p-label")
  colorLabel.textContent = "Accent"
  colorGroup.appendChild(colorLabel)
  const colorRow = el("div", "p-color-row")
  let chosenColor = prefill.color || ACCENT_COLORS[0]

  for (const c of ACCENT_COLORS) {
    const swatch = el(
      "button",
      `p-color-swatch${c === chosenColor ? " p-color-selected" : ""}`
    )
    swatch.style.background = c
    swatch.addEventListener("click", () => {
      chosenColor = c
      colorRow
        .querySelectorAll(".p-color-swatch")
        .forEach((s) => s.classList.toggle("p-color-selected", s === swatch))
    })
    colorRow.appendChild(swatch)
  }
  colorGroup.appendChild(colorRow)
  root.appendChild(colorGroup)

  return {
    root,
    refs: {
      titleInput,
      episodeInput,
      networkInput,
      yearInput,
      genreInput,
      noteInput,
      getColor: () => chosenColor,
    },
  }
}
