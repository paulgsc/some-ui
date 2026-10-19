/**
 * The popup's writes (#1807, #1966). It renders on import, so each test
 * re-imports it against a fresh fake `storage`.
 */

import {
  BOUNDARY_CHANGES_KEY,
  CHOICE_CHANGES_KEY,
  SETTINGS_KEY,
} from "@censor/lib/settings/settings"
import { ext } from "@censor/platform/content"
import { fakeStorage } from "@some-extension/common/testing"
import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  Reflect.deleteProperty(ext, "storage")
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
