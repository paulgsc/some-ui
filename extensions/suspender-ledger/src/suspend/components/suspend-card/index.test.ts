// Copyright (c) 2026 paulgsc — MIT License

import { beforeEach, describe, expect, it, vi } from "vitest"

import { SuspendCard, type SuspendCardProps } from "."

function mount(overrides: Partial<SuspendCardProps> = {}): {
  el: HTMLElement
  onRestore: ReturnType<typeof vi.fn>
} {
  const onRestore = vi.fn()
  const el = SuspendCard({
    title: "Example Domain",
    url: "https://example.com/",
    favIconUrl: undefined,
    recovery: false,
    onRestore,
    ...overrides,
  })
  document.body.replaceChildren(el)
  return { el, onRestore }
}

describe("SuspendCard", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("identifies itself as the extension's suspend page", () => {
    const { el } = mount()
    expect(el.querySelector(".suspend-card__badge")?.textContent).toBe(
      "Tab suspended by Suspender Ledger"
    )
  })

  it("renders the title, url, and a restore button", () => {
    const { el } = mount()
    expect(el.querySelector(".suspend-card__title")?.textContent).toBe(
      "Example Domain"
    )
    expect(el.querySelector(".suspend-card__url")?.textContent).toBe(
      "https://example.com/"
    )
    expect(el.querySelector(".suspend-card__restore")).not.toBeNull()
  })

  it("restores on the button click", () => {
    const { el, onRestore } = mount()
    el.querySelector<HTMLButtonElement>(".suspend-card__restore")?.click()
    expect(onRestore).toHaveBeenCalledTimes(1)
  })

  it("falls back to the hostname when the title is empty", () => {
    const { el } = mount({ title: "" })
    expect(el.querySelector(".suspend-card__title")?.textContent).toBe(
      "example.com"
    )
  })

  it("recovery mode hides the restore action and explains itself", () => {
    const { el } = mount({ recovery: true, title: "", url: "" })
    expect(el.querySelector(".suspend-card__restore")).toBeNull()
    expect(el.querySelector(".suspend-card__note")).not.toBeNull()
    expect(el.getAttribute("data-recovery")).toBe("true")
  })
})
