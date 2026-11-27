/**
 * Does KPLAY's shop fit the phone? (KP4, #2853.)
 *
 * The shop is the phone's alone, so it is swept on the phone page
 * (`./phone-page`, built under the Android app's profile) at the phone's
 * sizes (`PHONE_VIEWPORTS`, 780x390 among them), in each state
 * `./phone-page/shop.tsx` draws: the door on "What are you hungry for?",
 * the phrases found with their parts and one in the basket, a miss home
 * kept, a spoken hunch home is hearing, and a hunch kept on this phone
 * while home is out of reach. Each must leave the page as it was and never
 * be wider than the phone.
 *
 * Run against a built phone page:
 *
 *   pnpm --filter www build:fit-phone
 *   pnpm --filter www test:e2e tests/ui-fit/shop-fit.spec.ts
 */

import type { Page } from "@playwright/test"
import { expect, test } from "@playwright/test"

import { expectFitsPhone, PHONE_VIEWPORTS, servePhonePage } from "./harness"
import type { ShopId } from "./phone-page/shop"

const PAGE = servePhonePage()

/** The shop's words the sweep taps and waits on (topik's `SHOP_WORDS`). */
const W = {
  door: "Or say what you want to say",
  title: "What do you want to say?",
  field: "What you want to say",
  find: "Find it",
  found: "Here's how it's said.",
  pick: "Add to my basket",
  basket: "In your basket",
  again: "Something else",
  kept: /^Nothing on the shelf says that yet/,
  say: "Say it in English",
  stop: "Stop",
  looking: "Looking on home…",
  unreached: /^Home couldn't be reached\. Your words are kept on this phone/,
} as const

async function ask(page: Page, words: string): Promise<void> {
  await page.getByRole("textbox", { name: W.field }).fill(words)
  await page.getByRole("button", { name: W.find }).click()
}

async function opened(page: Page, fixture: ShopId): Promise<Array<string>> {
  const errors: Array<string> = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(PAGE.url(fixture), { waitUntil: "load" })
  return errors
}

test.describe("The shop fits the phone", () => {
  PAGE.skipUnbuilt()

  for (const phone of PHONE_VIEWPORTS) {
    const at = `at ${phone.name} (${phone.width}x${phone.height})`

    test(`the door ${at}`, async ({ page }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors = await opened(page, "shop-door")
      await expect(page.getByRole("button", { name: W.door })).toBeVisible()
      expect(errors, errors.join("\n")).toEqual([])
      await expectFitsPhone(page, "the door")
    })

    test(`found, kept and hearing ${at}`, async ({ page }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors = await opened(page, "shop")
      await expect(page.getByRole("heading", { name: W.title })).toBeVisible()
      await expectFitsPhone(page, "the shop")

      await ask(page, "I can't find my phone")
      await expect(page.getByText(W.found)).toBeVisible()
      await page.getByRole("button", { name: W.pick }).first().click()
      await expect(page.getByText(W.basket)).toBeVisible()
      await expectFitsPhone(page, "phrases found, one in the basket")

      await page.getByRole("button", { name: W.again }).click()
      await ask(page, "a word for the moon")
      await expect(page.getByText(W.kept)).toBeVisible()
      await expectFitsPhone(page, "a miss home kept")

      await page.getByRole("button", { name: W.again }).click()
      await page.getByRole("button", { name: W.say }).click()
      await page.getByRole("button", { name: W.stop }).click()
      await expect(page.getByText(W.looking)).toBeVisible()
      await expectFitsPhone(page, "a spoken hunch being heard")
      expect(errors, errors.join("\n")).toEqual([])
    })

    test(`home out of reach ${at}`, async ({ page }) => {
      PAGE.expectBuilt()
      await page.setViewportSize({ width: phone.width, height: phone.height })
      const errors = await opened(page, "shop-unreached")
      await ask(page, "I can't find my phone")
      await expect(page.getByText(W.unreached)).toBeVisible()
      await expectFitsPhone(page, "a hunch kept on this phone")
      expect(errors, errors.join("\n")).toEqual([])
    })
  }
})
