/**
 * BOYO — the popup's settings reach an open tab (#1807)
 *
 * S1 — Changing the boundary in the popup re-decides the cards of an open
 *      tab without a reload, and every stamp moves straight from one value
 *      to the other: no card is ever unstamped on the way.
 * S2 — The switch stops and restarts the runtime in that tab, and off lifts
 *      the pre-mask.
 * S3 — Under Strict a card the content script has not read is not painted;
 *      Standard blurs it (#1966).
 * S4 — A mode picked in the popup re-decides an open tab (#1966).
 * S5 — The settings page and the popup show the same stored choice: a mode
 *      picked on the page is the popup's pressed one (#1966).
 */

import { expect, test } from "@censor/playwright/fixture"
import { paintedPixels, VIVID } from "@censor/playwright/rendered"
import type { Page } from "@playwright/test"

/** "2 years ago": plated under one year, absent under two. */
const MOVES = "vid_ccc333"
/** "3 years ago": plated under either. */
const STAYS = "vid_aaa111"

/**
 * Every `data-boyo` change on `videoId`'s card from now on, as the value it
 * replaced. Read at the mutation, so a strip and restamp in one task still
 * leaves a `null` here.
 */
async function recordReplacedStamps(
  page: Page,
  videoId: string
): Promise<void> {
  await page.evaluate((vid) => {
    const replaced: Array<string | null> = []
    Reflect.set(window, "__REPLACED__", replaced)
    const card = document
      .querySelector(`a[href="/watch?v=${vid}"]`)
      ?.closest("ytd-rich-item-renderer")
    if (!(card instanceof HTMLElement)) throw new Error(`no card ${vid}`)
    new MutationObserver((records) => {
      for (const r of records) replaced.push(r.oldValue)
    }).observe(card, {
      attributes: true,
      attributeFilter: ["data-boyo"],
      attributeOldValue: true,
      subtree: true,
    })
  }, videoId)
}

async function replacedStamps(page: Page): Promise<Array<unknown>> {
  const seen = await page.evaluate((): unknown =>
    Reflect.get(window, "__REPLACED__")
  )
  const list: Array<unknown> = Array.isArray(seen) ? seen : []
  return list
}

test("S1: the boundary re-decides an open tab, stamp to stamp", async ({
  context,
  extensionId,
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(
    page,
    (d) => d.entries[MOVES]?.viewKind === "plated" && STAYS in d.entries
  )
  await recordReplacedStamps(page, MOVES)

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)

  await popup.getByRole("button", { name: "2 years" }).click()
  await expect(popup.getByRole("button", { name: "2 years" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  const raised = await fixture.pollDebug(
    page,
    (d) => d.entries[MOVES]?.viewKind === "absent"
  )
  expect(raised.entries[STAYS]?.viewKind).toBe("plated")
  expect(await fixture.fixtureCall(page, "dataBoyoFor", MOVES)).toBe("absent")

  await popup.getByRole("button", { name: "1 year" }).click()
  await fixture.pollDebug(page, (d) => d.entries[MOVES]?.viewKind === "plated")

  expect(await fixture.fixtureCall(page, "dataBoyoFor", MOVES)).toBe("plated")

  const replaced = await replacedStamps(page)
  expect(replaced.length).toBeGreaterThan(0)
  expect(replaced.every((v) => v === "absent" || v === "plated")).toBe(true)
})

test("S2: the switch stops and restarts the open tab", async ({
  context,
  extensionId,
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && MOVES in d.entries
  )

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const toggle = popup.getByRole("switch")

  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await fixture.pollDebug(page, (d) => d.phase === "idle")
  expect(await fixture.fixtureCall(page, "dataBoyoFor", MOVES)).toBeNull()
  // Off is plain YouTube: the pre-mask no longer blurs or blocks the card.
  expect(
    await page.evaluate((vid) => {
      const card = document
        .querySelector(`a[href="/watch?v=${vid}"]`)
        ?.closest("ytd-rich-item-renderer")
      if (!(card instanceof HTMLElement)) return null
      const style = getComputedStyle(card)
      return { filter: style.filter, pointerEvents: style.pointerEvents }
    }, MOVES)
  ).toEqual({ filter: "none", pointerEvents: "auto" })

  await toggle.click()
  await fixture.pollDebug(
    page,
    (d) => d.phase === "running" && d.entries[MOVES]?.viewKind === "plated"
  )
})

test("S3: Strict paints no unread card, and Standard blurs it", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => d.phase === "running")
  // A card with no video link: the stylesheet occludes it, and the content
  // script never reads it, so it stays unread for the whole test.
  await page.evaluate((src) => {
    const card = document.createElement("ytd-video-renderer")
    card.id = "unread"
    card.style.cssText = "display: block; width: 240px; height: 135px"
    const img = document.createElement("img")
    img.src = src
    img.style.cssText = "display: block; width: 100%; height: 100%"
    card.append(img)
    document.querySelector("ytd-app")?.append(card)
  }, VIVID)
  const card = page.locator("#unread")
  await expect(card).not.toHaveAttribute("data-boyo")
  const ground = await page.evaluate(() => {
    const [r = 0, g = 0, b = 0] =
      getComputedStyle(document.body)
        .backgroundColor.match(/\d+/g)
        ?.map(Number) ?? []
    return [r, g, b] as const
  })
  expect(
    await paintedPixels(card, ground),
    "Standard: blurred"
  ).toBeGreaterThan(0)

  await fixture.settings({ mode: "strict" })
  await expect(page.locator("html")).toHaveAttribute(
    "data-boyo-loading",
    "blank"
  )
  expect(await paintedPixels(card, ground), "Strict: not painted").toBe(0)
  await expect(card).not.toHaveAttribute("data-boyo")
})

test("S4: a mode picked in the popup reaches an open tab", async ({
  context,
  extensionId,
  fixture,
}) => {
  const page = await fixture.goto("yt-lane")
  await expect(page.locator("#ost")).toHaveAttribute("data-boyo", "whole")

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.getByRole("button", { name: "Strict" }).click()
  await expect(popup.getByRole("button", { name: "Strict" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.locator("#ost")).toHaveAttribute("data-boyo", "absent")
})

test("S5: the settings page and the popup show the same choice", async ({
  context,
  extensionId,
}) => {
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  // A card's name is all it says, and it says its mode's name first.
  const open = options.getByRole("button", { name: /^Open/ })
  await open.click()
  await expect(open).toHaveAttribute("aria-pressed", "true")

  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.getByRole("button", { name: "Open" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await popup.getByRole("button", { name: "Skip it" }).click()
  await expect(
    options.getByRole("button", { name: "Skip it" })
  ).toHaveAttribute("aria-pressed", "true")
})
