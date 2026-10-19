/**
 * The settings page (`options.html`, #1966), after the 2026-10-19
 * prototype: three mode cards, strictest first, each listing the same rows
 * so they read across; what every mode keeps; then the age and what
 * autoplay does at a held video. A mode is picked whole, by its card, and
 * nothing inside one can be changed on its own.
 *
 * Like the popup, it renders from {@link followSettings} and writes
 * through {@link createSaver}, so it always shows what is stored.
 */
import { onSwitch, segments } from "@censor/lib/settings/choices"
import type { Mode, Settings } from "@censor/lib/settings/settings"
import {
  AUTOPLAYS,
  BOUNDARIES,
  BOUNDARY_LABEL,
  createSaver,
  DEFAULT_SETTINGS,
  followSettings,
  MODES,
} from "@censor/lib/settings/settings"
import {
  AGE_QUESTION,
  AUTOPLAY_QUESTION,
  AUTOPLAY_WORDS,
  EVERY_MODE,
  MODE_QUESTION,
  MODE_ROWS,
  MODE_WORDS,
  PAGE_WORDS,
} from "@censor/lib/settings/words"
import { ext } from "@censor/platform/content"

import "./options.css"

const save = createSaver(ext.storage.local)

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function header(settings: Settings): HTMLElement {
  const bar = el("header", "options__header")
  const title = el("div", "options__title")
  title.append(
    el("span", "options__name", "BOYO"),
    el("h1", "options__h1", "Settings")
  )
  const state = el("div", "options__state")
  const said = el("span", "", settings.enabled ? PAGE_WORDS.on : PAGE_WORDS.off)
  said.id = "on-state"
  const toggle = onSwitch(settings.enabled, () => {
    save((stored) => ({ ...stored, enabled: !stored.enabled }))
  })
  toggle.setAttribute("aria-describedby", said.id)
  state.append(said, toggle)
  bar.append(title, state)
  return bar
}

function card(mode: Mode, current: Mode): HTMLElement {
  const words = MODE_WORDS[mode]
  const defaults = MODE_WORDS[DEFAULT_SETTINGS.mode]
  const chosen = mode === current
  const button = el("button", "mode-card")
  button.type = "button"
  button.setAttribute("aria-pressed", String(chosen))
  button.addEventListener("click", () => {
    save((stored) => ({ ...stored, mode }))
  })

  const name = el("span", "mode-card__name", words.name)
  name.id = `${mode}-name`
  const tag = el("span", "mode-card__tag", words.tag)
  tag.id = `${mode}-tag`
  // A button's children are not read out on their own, so its description
  // points at the badge, the tag and every row: what the cards compare.
  const described = [tag.id]

  const top = el("span", "mode-card__top")
  top.append(name)
  const badge = chosen
    ? el("span", "mode-card__badge", PAGE_WORDS.current)
    : mode === DEFAULT_SETTINGS.mode
      ? el(
          "span",
          "mode-card__badge mode-card__badge--quiet",
          PAGE_WORDS.default
        )
      : null
  if (badge) {
    badge.id = `${mode}-badge`
    described.unshift(badge.id)
    top.append(badge)
  }
  button.append(top, tag)

  MODE_ROWS.forEach((row, i) => {
    const line = el("span", "mode-card__row")
    const value = words.rows[row]
    const differs =
      mode !== DEFAULT_SETTINGS.mode && value !== defaults.rows[row]
    const label = el("span", "mode-card__label", row)
    label.id = `${mode}-row-${String(i)}`
    const said = el(
      "span",
      differs
        ? "mode-card__value mode-card__value--differs"
        : "mode-card__value",
      value
    )
    said.id = `${label.id}-value`
    described.push(label.id, said.id)
    line.append(label, said)
    button.append(line)
  })
  button.setAttribute("aria-labelledby", name.id)
  button.setAttribute("aria-describedby", described.join(" "))
  return button
}

function modes(settings: Settings): HTMLElement {
  const section = el("section", "options__section")
  section.toggleAttribute("inert", !settings.enabled)
  const head = el("div", "options__section-head")
  const h2 = el("h2", "options__h2", MODE_QUESTION)
  h2.id = "mode-heading"
  head.append(h2, el("span", "options__scale", PAGE_WORDS.scale))
  const grid = el("div", "mode-cards")
  grid.setAttribute("role", "group")
  grid.setAttribute("aria-labelledby", h2.id)
  for (const mode of MODES) grid.append(card(mode, settings.mode))

  const every = el("p", "options__every")
  every.append(el("strong", "", PAGE_WORDS.everyMode))
  for (const line of EVERY_MODE) every.append(el("span", "", line))

  section.append(head, grid, every)
  return section
}

function standalone(settings: Settings): HTMLElement {
  const section = el("section", "options__section options__choices")
  section.toggleAttribute("inert", !settings.enabled)
  section.append(
    segments({
      id: "age",
      question: AGE_QUESTION,
      values: BOUNDARIES,
      label: (boundary) => BOUNDARY_LABEL[boundary],
      current: settings.boundary,
      onPick: (boundary) => save((stored) => ({ ...stored, boundary })),
      line: PAGE_WORDS.ageNote,
    }),
    segments({
      id: "autoplay",
      question: AUTOPLAY_QUESTION,
      values: AUTOPLAYS,
      label: (autoplay) => AUTOPLAY_WORDS[autoplay].label,
      current: settings.autoplay,
      onPick: (autoplay) => save((stored) => ({ ...stored, autoplay })),
      line: AUTOPLAY_WORDS[settings.autoplay].line,
    })
  )
  return section
}

function footer(): HTMLElement {
  const bar = el("footer", "options__footer")
  const diagnostics = el("a", "options__link", PAGE_WORDS.diagnostics)
  diagnostics.href = ext.runtime.getURL("debug.html")
  bar.append(el("span", "", PAGE_WORDS.follows), diagnostics)
  return bar
}

function render(settings: Settings): void {
  const root = document.getElementById("app")
  if (!root) return
  root.classList.toggle("boyo-options-off", !settings.enabled)
  root.replaceChildren(
    header(settings),
    modes(settings),
    standalone(settings),
    footer()
  )
}

followSettings(ext.storage, render)
