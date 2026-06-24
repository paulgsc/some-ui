// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { beforeEach, describe, expect, it, vi } from "vitest"

import { ActionMenu, type ActionMenuProps } from "."

function mount(overrides: Partial<ActionMenuProps> = {}): {
  el: HTMLElement
  onCommand: ReturnType<typeof vi.fn>
} {
  const onCommand = vi.fn()
  const el = ActionMenu({
    whitelisted: false,
    autoSuspendable: true,
    onCommand,
    ...overrides,
  })
  document.body.replaceChildren(el)
  return { el, onCommand }
}

function buttonByText(el: HTMLElement, text: string): HTMLButtonElement {
  const btn = Array.from(el.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text
  )
  if (!btn) throw new Error(`button "${text}" not found`)
  return btn
}

describe("ActionMenu — primary commands", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("suspends the active tab", () => {
    const { el, onCommand } = mount()
    buttonByText(el, "Suspend tab").click()
    expect(onCommand).toHaveBeenCalledWith("discard-tab")
  })

  it("suspends all eligible tabs with the shift override", () => {
    const { el, onCommand } = mount()
    buttonByText(el, "Suspend all").click()
    expect(onCommand).toHaveBeenCalledWith("discard-tabs", { shiftKey: true })
  })

  it("dispatches focus navigation", () => {
    const { el, onCommand } = mount()
    buttonByText(el, "Next tab").click()
    buttonByText(el, "Prev tab").click()
    expect(onCommand).toHaveBeenNthCalledWith(1, "move-next")
    expect(onCommand).toHaveBeenNthCalledWith(2, "move-previous")
  })
})

describe("ActionMenu — toggles", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("reflects the whitelisted/auto-suspendable state on the checkboxes", () => {
    const { el } = mount({ whitelisted: true, autoSuspendable: false })
    const [whitelist, auto] = Array.from(
      el.querySelectorAll<HTMLInputElement>(".action-menu__toggle-input")
    )
    expect(whitelist?.checked).toBe(true)
    expect(auto?.checked).toBe(false)
  })

  it("emits whitelist-domain with the new checked state", () => {
    const { el, onCommand } = mount({ whitelisted: false })
    const input = el.querySelector<HTMLInputElement>(
      ".action-menu__toggle-input"
    )
    if (!input) throw new Error("toggle missing")
    input.checked = true
    input.dispatchEvent(new Event("change", { bubbles: true }))
    expect(onCommand).toHaveBeenCalledWith("whitelist-domain", {
      checked: true,
    })
  })

  it("emits auto-discardable with value+checked", () => {
    const { el, onCommand } = mount({ autoSuspendable: true })
    const inputs = el.querySelectorAll<HTMLInputElement>(
      ".action-menu__toggle-input"
    )
    const auto = inputs[1]
    if (!auto) throw new Error("auto toggle missing")
    auto.checked = false
    auto.dispatchEvent(new Event("change", { bubbles: true }))
    expect(onCommand).toHaveBeenCalledWith("auto-discardable", {
      value: false,
      checked: false,
    })
  })
})
