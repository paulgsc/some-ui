// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Adapted from auto-tab-discard v3/data/options (MPL-2.0)
// Copyright (C) auto-tab-discard contributors

/** The editable preference subset the popup's settings form owns. */
export type SettingsValues = {
  /** Idle detection threshold, in minutes (persisted as seconds). */
  idleTimeoutMinutes: number
  /** Discard age threshold, in minutes (persisted as seconds). */
  discardPeriodMinutes: number
  /** Minimum number of tabs to keep loaded before suspending the rest. */
  minTabs: number
  /** Render the original favicon on suspended tabs. */
  showFavicon: boolean
  /** Title marker prepended to suspended tabs (e.g. the 💤 glyph). */
  prepend: string
  /** When false, pinned tabs are never suspended. */
  suspendPinned: boolean
  /** Whitelisted hostnames / `re:`-prefixed rules. */
  whitelist: Array<string>
}

/** A keyboard command surfaced read-only in the shortcuts section. */
export type ShortcutHint = {
  description: string
  shortcut: string
}

export type SettingsFormProps = {
  values: SettingsValues
  shortcuts: Array<ShortcutHint>
  /** Emitted with a partial patch whenever a field changes. */
  onChange: (patch: Partial<SettingsValues>) => void
  /** Add a raw hostname / rule to the whitelist. */
  onWhitelistAdd: (rule: string) => void
  /** Remove a rule from the whitelist. */
  onWhitelistRemove: (rule: string) => void
}

/**
 * Preferences form embedded in the popup (the beta folds the standalone options
 * page into a disclosure here). Covers idle timeout, discard age, the loaded-tab
 * floor, favicon/title presentation, pinned-tab handling, whitelist management,
 * and a read-only keyboard-shortcuts list.
 *
 * Postcondition: returns a detached `HTMLElement` ready to mount.
 */
export function SettingsForm({
  values,
  shortcuts,
  onChange,
  onWhitelistAdd,
  onWhitelistRemove,
}: SettingsFormProps): HTMLElement {
  const el = document.createElement("section")
  el.className = "settings"

  el.appendChild(
    numberField(
      "Idle timeout",
      "Minutes of inactivity before the browser is treated as idle.",
      values.idleTimeoutMinutes,
      { min: 1, max: 240 },
      (n) => onChange({ idleTimeoutMinutes: n })
    )
  )
  el.appendChild(
    numberField(
      "Suspend after",
      "Minutes a background tab may sit before it is eligible to suspend.",
      values.discardPeriodMinutes,
      { min: 0, max: 1440 },
      (n) => onChange({ discardPeriodMinutes: n })
    )
  )
  el.appendChild(
    numberField(
      "Keep loaded",
      "Minimum number of recent tabs to leave loaded.",
      values.minTabs,
      { min: 0, max: 100 },
      (n) => onChange({ minTabs: n })
    )
  )
  el.appendChild(
    textField(
      "Title marker",
      "Prefixed to suspended tab titles.",
      values.prepend,
      (s) => onChange({ prepend: s })
    )
  )
  el.appendChild(
    checkboxField(
      "Show favicon",
      "Keep the original favicon on suspended tabs.",
      values.showFavicon,
      (b) => onChange({ showFavicon: b })
    )
  )
  el.appendChild(
    checkboxField(
      "Suspend pinned tabs",
      "Allow pinned tabs to be suspended too.",
      values.suspendPinned,
      (b) => onChange({ suspendPinned: b })
    )
  )

  el.appendChild(
    whitelistField(values.whitelist, onWhitelistAdd, onWhitelistRemove)
  )

  if (shortcuts.length > 0) {
    el.appendChild(shortcutsField(shortcuts))
  }

  return el
}

// ── Field builders ───────────────────────────────────────────────────────────

function fieldShell(label: string, hint: string): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "settings__field"
  const text = document.createElement("div")
  text.className = "settings__field-text"
  const main = document.createElement("span")
  main.className = "settings__field-label"
  main.textContent = label
  const sub = document.createElement("span")
  sub.className = "settings__field-hint"
  sub.textContent = hint
  text.append(main, sub)
  wrap.appendChild(text)
  return wrap
}

function numberField(
  label: string,
  hint: string,
  value: number,
  bounds: { min: number; max: number },
  onInput: (n: number) => void
): HTMLElement {
  const wrap = fieldShell(label, hint)
  const input = document.createElement("input")
  input.type = "number"
  input.className = "settings__input settings__input--number"
  input.min = String(bounds.min)
  input.max = String(bounds.max)
  input.value = String(value)
  input.addEventListener("change", () => {
    const n = Number(input.value)
    if (Number.isFinite(n)) {
      onInput(Math.min(bounds.max, Math.max(bounds.min, Math.round(n))))
    }
  })
  wrap.appendChild(input)
  return wrap
}

function textField(
  label: string,
  hint: string,
  value: string,
  onInput: (s: string) => void
): HTMLElement {
  const wrap = fieldShell(label, hint)
  const input = document.createElement("input")
  input.type = "text"
  input.className = "settings__input settings__input--text"
  input.value = value
  input.addEventListener("change", () => onInput(input.value))
  wrap.appendChild(input)
  return wrap
}

function checkboxField(
  label: string,
  hint: string,
  value: boolean,
  onToggle: (b: boolean) => void
): HTMLElement {
  const wrap = fieldShell(label, hint)
  wrap.classList.add("settings__field--inline")
  const input = document.createElement("input")
  input.type = "checkbox"
  input.className = "settings__input settings__input--checkbox"
  input.checked = value
  input.addEventListener("change", () => onToggle(input.checked))
  wrap.appendChild(input)
  return wrap
}

function whitelistField(
  rules: Array<string>,
  onAdd: (rule: string) => void,
  onRemove: (rule: string) => void
): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "settings__field settings__field--whitelist"

  const text = document.createElement("div")
  text.className = "settings__field-text"
  const main = document.createElement("span")
  main.className = "settings__field-label"
  main.textContent = "Whitelist"
  const sub = document.createElement("span")
  sub.className = "settings__field-hint"
  sub.textContent = "Hosts never auto-suspended."
  text.append(main, sub)
  wrap.appendChild(text)

  const addRow = document.createElement("div")
  addRow.className = "settings__whitelist-add"
  const input = document.createElement("input")
  input.type = "text"
  input.className = "settings__input settings__input--text"
  input.placeholder = "example.com"
  const addBtn = document.createElement("button")
  addBtn.type = "button"
  addBtn.className = "settings__whitelist-addbtn"
  addBtn.textContent = "Add"
  const commit = (): void => {
    const rule = input.value.trim()
    if (rule) {
      onAdd(rule)
      input.value = ""
    }
  }
  addBtn.addEventListener("click", commit)
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commit()
    }
  })
  addRow.append(input, addBtn)
  wrap.appendChild(addRow)

  const list = document.createElement("ul")
  list.className = "settings__whitelist"
  if (rules.length === 0) {
    const empty = document.createElement("li")
    empty.className = "settings__whitelist-empty"
    empty.textContent = "No hosts whitelisted."
    list.appendChild(empty)
  } else {
    for (const rule of rules) {
      const item = document.createElement("li")
      item.className = "settings__whitelist-item"
      const ruleText = document.createElement("span")
      ruleText.className = "settings__whitelist-rule"
      ruleText.textContent = rule
      ruleText.title = rule
      const remove = document.createElement("button")
      remove.type = "button"
      remove.className = "settings__whitelist-remove"
      remove.setAttribute("aria-label", `Remove ${rule}`)
      remove.textContent = "✕"
      remove.addEventListener("click", () => onRemove(rule))
      item.append(ruleText, remove)
      list.appendChild(item)
    }
  }
  wrap.appendChild(list)
  return wrap
}

function shortcutsField(shortcuts: Array<ShortcutHint>): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "settings__field settings__field--shortcuts"

  const main = document.createElement("span")
  main.className = "settings__field-label"
  main.textContent = "Keyboard shortcuts"
  wrap.appendChild(main)

  const list = document.createElement("dl")
  list.className = "settings__shortcuts"
  for (const { description, shortcut } of shortcuts) {
    const dt = document.createElement("dt")
    dt.className = "settings__shortcut-desc"
    dt.textContent = description
    const dd = document.createElement("dd")
    dd.className = "settings__shortcut-key"
    dd.textContent = shortcut || "unset"
    list.append(dt, dd)
  }
  wrap.appendChild(list)
  return wrap
}
