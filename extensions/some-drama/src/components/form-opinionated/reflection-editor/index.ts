// ── ReflectionEditor ──────────────────────────────────────────────────────────
// Owns: "Why did it matter?" textarea. Auto-grow, char counter, success pulse.

import { el } from "@drama/effects/content/dom"

import type { JournalDraft } from "../use-drama-journal-state"

const MAX_CHARS = 240

export function buildReflectionEditor(
  value: Pick<JournalDraft, "reflection">,
  onChange: (patch: Partial<JournalDraft>) => void
): { root: HTMLDivElement } {
  const root = el("div", "dj-section")

  const prompt = el("label", "dj-prompt")
  prompt.textContent = "What made this episode memorable?"
  root.appendChild(prompt)

  const textarea = el("textarea", "dj-textarea dj-reflection-textarea")
  textarea.rows = 1
  textarea.placeholder = "The confession finally broke the emotional stalemate…"
  textarea.value = value.reflection
  textarea.maxLength = MAX_CHARS

  const counter = el("span", "dj-char-fade")
  const renderCounter = (): void => {
    counter.textContent = `${textarea.value.length} / ${MAX_CHARS}`
  }
  renderCounter()

  const autoGrow = (): void => {
    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
  }
  autoGrow()

  let wasEmpty = textarea.value.trim().length === 0

  textarea.addEventListener("input", () => {
    autoGrow()
    renderCounter()

    const isEmpty = textarea.value.trim().length === 0
    if (wasEmpty && !isEmpty) {
      textarea.classList.add("dj-success")
      textarea.addEventListener(
        "animationend",
        () => textarea.classList.remove("dj-success"),
        { once: true }
      )
    }
    wasEmpty = isEmpty

    onChange({ reflection: textarea.value })
  })

  root.appendChild(textarea)
  root.appendChild(counter)

  return { root }
}
