// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  SettingsForm,
  type SettingsFormProps,
  type SettingsValues,
} from "."

const VALUES: SettingsValues = {
  idleTimeoutMinutes: 5,
  discardPeriodMinutes: 10,
  minTabs: 6,
  showFavicon: false,
  prepend: "💤",
  suspendPinned: false,
  whitelist: ["github.com"],
}

function mount(overrides: Partial<SettingsFormProps> = {}): {
  el: HTMLElement
  onChange: ReturnType<typeof vi.fn>
  onWhitelistAdd: ReturnType<typeof vi.fn>
  onWhitelistRemove: ReturnType<typeof vi.fn>
} {
  const onChange = vi.fn()
  const onWhitelistAdd = vi.fn()
  const onWhitelistRemove = vi.fn()
  const el = SettingsForm({
    values: VALUES,
    shortcuts: [{ description: "Suspend the active tab", shortcut: "Alt+D" }],
    onChange,
    onWhitelistAdd,
    onWhitelistRemove,
    ...overrides,
  })
  document.body.replaceChildren(el)
  return { el, onChange, onWhitelistAdd, onWhitelistRemove }
}

describe("SettingsForm — field edits", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("clamps and emits the idle timeout on change", () => {
    const { el, onChange } = mount()
    const input = el.querySelector<HTMLInputElement>(
      ".settings__input--number"
    )
    if (!input) throw new Error("number field missing")
    input.value = "999"
    input.dispatchEvent(new Event("change", { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith({ idleTimeoutMinutes: 240 })
  })

  it("emits the title marker on change", () => {
    const { el, onChange } = mount()
    const input = el.querySelector<HTMLInputElement>(".settings__input--text")
    if (!input) throw new Error("text field missing")
    input.value = "zZ"
    input.dispatchEvent(new Event("change", { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith({ prepend: "zZ" })
  })

  it("emits the favicon checkbox state", () => {
    const { el, onChange } = mount()
    const box = el.querySelector<HTMLInputElement>(
      ".settings__input--checkbox"
    )
    if (!box) throw new Error("checkbox missing")
    box.checked = true
    box.dispatchEvent(new Event("change", { bubbles: true }))
    expect(onChange).toHaveBeenCalledWith({ showFavicon: true })
  })
})

describe("SettingsForm — whitelist management", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("renders existing rules and removes one", () => {
    const { el, onWhitelistRemove } = mount()
    const remove = el.querySelector<HTMLButtonElement>(
      ".settings__whitelist-remove"
    )
    if (!remove) throw new Error("remove button missing")
    remove.click()
    expect(onWhitelistRemove).toHaveBeenCalledWith("github.com")
  })

  it("adds a trimmed rule via the add button", () => {
    const { el, onWhitelistAdd } = mount()
    const input = el.querySelector<HTMLInputElement>(
      ".settings__whitelist-add .settings__input--text"
    )
    const add = el.querySelector<HTMLButtonElement>(
      ".settings__whitelist-addbtn"
    )
    if (!input || !add) throw new Error("whitelist add controls missing")
    input.value = "  example.com  "
    add.click()
    expect(onWhitelistAdd).toHaveBeenCalledWith("example.com")
  })

  it("ignores an empty add", () => {
    const { el, onWhitelistAdd } = mount()
    const add = el.querySelector<HTMLButtonElement>(
      ".settings__whitelist-addbtn"
    )
    add?.click()
    expect(onWhitelistAdd).not.toHaveBeenCalled()
  })

  it("shows the empty state when no rules exist", () => {
    const { el } = mount({ values: { ...VALUES, whitelist: [] } })
    expect(el.querySelector(".settings__whitelist-empty")).not.toBeNull()
  })
})
