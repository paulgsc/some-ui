/**
 * The two controls the popup and the settings page share (#1966): the
 * on/off switch and a row of segments, one per value, the stored one
 * pressed. Each renders what is stored and reports a pick; neither keeps
 * state of its own. `choices.css` draws them.
 */

import { PAGE_WORDS } from "./words"

import "./choices.css"

/** The extension's on/off switch. */
export function onSwitch(on: boolean, onToggle: () => void): HTMLElement {
  const toggle = document.createElement("button")
  toggle.type = "button"
  toggle.className = "choice-switch"
  toggle.setAttribute("role", "switch")
  toggle.setAttribute("aria-checked", String(on))
  toggle.setAttribute("aria-label", PAGE_WORDS.on)
  toggle.addEventListener("click", onToggle)
  return toggle
}

/**
 * A labelled row of segments for `values`, the `current` one pressed, with
 * an optional line under it saying what the current one does.
 */
export function segments<T extends string>(choice: {
  readonly id: string
  readonly question: string
  readonly values: ReadonlyArray<T>
  readonly label: (value: T) => string
  readonly current: T
  readonly onPick: (value: T) => void
  readonly line?: string
}): HTMLElement {
  const el = document.createElement("div")
  el.className = "choice"

  const question = document.createElement("div")
  question.className = "choice__question"
  question.id = `${choice.id}-question`
  question.textContent = choice.question

  const group = document.createElement("div")
  group.className = "choice__segments"
  group.setAttribute("role", "group")
  group.setAttribute("aria-labelledby", question.id)
  for (const value of choice.values) {
    const option = document.createElement("button")
    option.type = "button"
    option.textContent = choice.label(value)
    option.setAttribute("aria-pressed", String(value === choice.current))
    option.addEventListener("click", () => choice.onPick(value))
    group.appendChild(option)
  }
  el.append(question, group)

  if (choice.line !== undefined) {
    const line = document.createElement("div")
    line.className = "choice__line"
    line.textContent = choice.line
    el.append(line)
  }
  return el
}
