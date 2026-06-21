// ── QuoteCapture ──────────────────────────────────────────────────────────────
// Owns: "What line stayed with you?" textarea. Same delight layer as
// ReflectionEditor but smaller and styled as a quote.

import type { JournalDraft } from "@drama/components/form-opinionated/use-drama-journal-state"
import { el } from "@drama/lib/content/utils"

const MAX_CHARS = 120

export function buildQuoteCapture(
  value: Pick<JournalDraft, "quote">,
  onChange: (patch: Partial<JournalDraft>) => void
): { root: HTMLDivElement } {
  const root = el("div", "dj-section")

  const prompt = el("label", "dj-prompt")
  prompt.textContent = "What line stayed with you?"
  root.appendChild(prompt)

  const textarea = el("textarea", "dj-textarea dj-quote-textarea")
  textarea.rows = 1
  textarea.placeholder = '"Stay. Just this once."'
  textarea.value = value.quote
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

    onChange({ quote: textarea.value })
  })

  root.appendChild(textarea)
  root.appendChild(counter)

  return { root }
}
