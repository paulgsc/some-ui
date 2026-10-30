/**
 * The popup's writes (#1807, #1966). It renders on import, so each test
 * re-imports it against a fresh fake `storage`.
 */

import {
  BOUNDARY_CHANGES_KEY,
  CHOICE_CHANGES_KEY,
  SETTINGS_KEY,
} from "@censor/lib/settings/settings"
import { STOP_WORDS } from "@censor/lib/settings/words"
import { ext } from "@censor/platform/content"
import { fakeStorage } from "@some-extension/common/testing"
import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  Reflect.deleteProperty(ext, "storage")
  Reflect.deleteProperty(ext, "tabs")
  Reflect.deleteProperty(ext, "action")
  Reflect.deleteProperty(ext.runtime, "getURL")
})

it("builds two quick clicks on each other, logging each change", async () => {
  const fake = fakeStorage()
  Reflect.set(ext, "storage", {
    local: fake.area,
    onChanged: { addListener: () => {} },
  })
  Reflect.set(ext.runtime, "getURL", (path: string) => path)
  document.body.innerHTML = '<div id="app"></div>'
  vi.resetModules()
  await import("@censor/popup/popup")

  const button = (name: string): HTMLElement => {
    const found = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("role") === name
    )
    if (!found) throw new Error(`no ${name}`)
    return found
  }
  await vi.waitFor(() => button("2 years"))
  // No re-render between the clicks: every handler holds the first render.
  button("2 years").click()
  button("Strict").click()
  button("Skip it").click()
  button("switch").click()

  await vi.waitFor(() => {
    expect(fake.store.get(SETTINGS_KEY)).toEqual({
      v: 1,
      boundary: "2y",
      mode: "strict",
      autoplay: "skip",
      enabled: false,
    })
  })
  expect(fake.store.get(BOUNDARY_CHANGES_KEY)).toEqual([
    { at: expect.any(Number), from: "1y", to: "2y" },
  ])
  expect(fake.store.get(CHOICE_CHANGES_KEY)).toEqual([
    { at: expect.any(Number), choice: "mode", from: "standard", to: "strict" },
    { at: expect.any(Number), choice: "autoplay", from: "stop", to: "skip" },
  ])
})

it("while off, leaves every choice out of reach but the switch", async () => {
  const fake = fakeStorage()
  fake.store.set(SETTINGS_KEY, { v: 1, enabled: false })
  Reflect.set(ext, "storage", {
    local: fake.area,
    onChanged: { addListener: () => {} },
  })
  Reflect.set(ext.runtime, "getURL", (path: string) => path)
  document.body.innerHTML = '<div id="app"></div>'
  vi.resetModules()
  await import("@censor/popup/popup")

  await vi.waitFor(() => {
    expect(
      document.querySelector(".popup__choices")?.hasAttribute("inert")
    ).toBe(true)
  })
  expect(document.querySelector('[role="switch"]')?.closest("[inert]")).toBe(
    null
  )
})

it("says what the toolbar button's notice means, only while it is on (R13)", async () => {
  for (const badge of ["", STOP_WORDS.badge]) {
    Reflect.set(ext, "storage", {
      local: fakeStorage().area,
      onChanged: { addListener: () => {} },
    })
    Reflect.set(ext.runtime, "getURL", (path: string) => path)
    Reflect.set(ext, "tabs", {
      query: (): Promise<Array<{ id: number }>> => Promise.resolve([{ id: 3 }]),
    })
    Reflect.set(ext, "action", {
      getBadgeText: ({ tabId }: { tabId: number }): Promise<string> =>
        Promise.resolve(tabId === 3 ? badge : ""),
    })
    document.body.innerHTML = '<div id="app"></div>'
    vi.resetModules()
    await import("@censor/popup/popup")
    await vi.waitFor(() => {
      expect(document.querySelector(".popup__choices")).not.toBeNull()
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      document.querySelector(".popup__stopped")?.textContent ?? null,
      badge || "no badge"
    ).toBe(badge === "" ? null : STOP_WORDS.headline + STOP_WORDS.line)
  }
})
