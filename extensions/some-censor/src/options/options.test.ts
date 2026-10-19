/**
 * The settings page (#1966): it shows what is stored, a mode is picked
 * whole by its card, and every pick is logged. It renders on import, so
 * each test re-imports it against a fresh fake `storage`.
 */

import { CHOICE_CHANGES_KEY, SETTINGS_KEY } from "@censor/lib/settings/settings"
import { ext } from "@censor/platform/content"
import { fakeStorage } from "@some-extension/common/testing"
import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
  Reflect.deleteProperty(ext, "storage")
  Reflect.deleteProperty(ext.runtime, "getURL")
})

async function mount(stored: unknown): Promise<ReturnType<typeof fakeStorage>> {
  const fake = fakeStorage()
  if (stored !== undefined) fake.store.set(SETTINGS_KEY, stored)
  Reflect.set(ext, "storage", {
    local: fake.area,
    onChanged: { addListener: () => {} },
  })
  Reflect.set(ext.runtime, "getURL", (path: string) => path)
  document.body.innerHTML = '<main id="app"></main>'
  vi.resetModules()
  await import("@censor/options/options")
  return fake
}

const cards = (): Array<HTMLElement> => [
  ...document.querySelectorAll<HTMLElement>(".mode-card"),
]

it("shows the three modes, strictest first, the stored one pressed", async () => {
  await mount({ v: 1, mode: "open" })
  await vi.waitFor(() => expect(cards()).toHaveLength(3))
  expect(
    cards().map((c) => c.querySelector(".mode-card__name")?.textContent)
  ).toEqual(["Strict", "Standard", "Open"])
  expect(cards().map((c) => c.getAttribute("aria-pressed"))).toEqual([
    "false",
    "false",
    "true",
  ])
  // Each card lists the same five rows, so they read across.
  for (const card of cards()) {
    expect(card.querySelectorAll(".mode-card__row")).toHaveLength(5)
  }
})

it("picks a mode whole by its card, and logs it", async () => {
  const fake = await mount(undefined)
  await vi.waitFor(() => expect(cards()).toHaveLength(3))
  cards()[0]?.click()
  await vi.waitFor(() => {
    expect(fake.store.get(SETTINGS_KEY)).toMatchObject({ mode: "strict" })
  })
  expect(fake.store.get(CHOICE_CHANGES_KEY)).toEqual([
    { at: expect.any(Number), choice: "mode", from: "standard", to: "strict" },
  ])
})

it("sets autoplay on its own, in every mode", async () => {
  const fake = await mount({ v: 1, mode: "strict" })
  await vi.waitFor(() => expect(cards()).toHaveLength(3))
  const skip = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Skip it"
  )
  skip?.click()
  await vi.waitFor(() => {
    expect(fake.store.get(SETTINGS_KEY)).toMatchObject({
      mode: "strict",
      autoplay: "skip",
    })
  })
})
