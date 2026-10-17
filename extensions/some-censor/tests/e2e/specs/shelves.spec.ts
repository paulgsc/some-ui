/**
 * BOYO — a shelf whose every card is absent goes with its cards (#1846, QD11)
 *
 * Absent cards take no space, and neither does the home grid's cell around
 * one. A shelf is a row of cards under a header: once every card in it is
 * absent, the header would stand over nothing. The fixture is real markup
 * from three surfaces (see yt-shelves.html).
 *
 * SH1 — An all-absent shelf leaves no header and takes no space, on home,
 *       search and a channel page. On search the shelf goes and its
 *       neighbours stay; on a channel page the section that draws the
 *       separator goes with it.
 * SH2 — A shelf with a plated card, or with a tile no content script takes,
 *       stays, header and all.
 * SH3 — On a real engine, a shelf waiting on a card not adopted yet does not
 *       collapse early, and wrappers alone do not hold it open.
 */

import { SHELF_COLLAPSE_SELECTORS } from "@censor/lib/content/selectors"
import { expect, test } from "@censor/playwright/fixture"
import type { Page } from "@playwright/test"

const CARDS = [
  "sh_home01",
  "sh_home02",
  "sh_home03",
  "vid_old001",
  "sh_home05",
  "sh_srch01",
  "sh_srch02",
  "sh_srch03",
  "vid_srch_a",
  "vid_srch_b",
  "sh_chan01",
  "sh_chan02",
  "sh_chan03",
  "vid_pl001",
  "vid_pl002",
  "vid_old002",
  "vid_pl102",
] as const

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    (ids) =>
      ids.every(
        (id) =>
          document.querySelector(`[data-boyo-vid="${id}"][data-boyo]`) !== null
      ),
    CARDS,
    { timeout: 8000 }
  )
}

/** Laid out at all: `display: none` anywhere above gives no box. */
async function laidOut(page: Page, selector: string): Promise<boolean> {
  return (await page.locator(selector).boundingBox()) !== null
}

test("SH1: an all-absent shelf leaves no header and no gap", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-shelves")
  await settled(page)

  for (const shelf of [
    "#home-shorts",
    "#search-shorts",
    "#channel-shorts",
    "#channel-playlist",
  ]) {
    expect(await laidOut(page, shelf), `${shelf} is not laid out`).toBe(false)
    expect(
      await page.locator(shelf).evaluate((el) => getComputedStyle(el).display),
      `${shelf} is out of the accessibility tree too`
    ).toBe("none")
  }
  await expect(page.locator("#home-shorts h2")).toBeHidden()
  await expect(page.locator("#channel-playlist h2")).toBeHidden()

  // Search: one result among others, so only the shelf goes.
  expect(await laidOut(page, "#search-section")).toBe(true)
  expect(await laidOut(page, "#search-before")).toBe(true)
  expect(await laidOut(page, "#search-after")).toBe(true)
})

test("SH2: a shelf with a plated card or a non-video tile stays", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-shelves")
  await settled(page)

  for (const shelf of ["#home-mixed", "#home-tile", "#channel-kept"]) {
    expect(await laidOut(page, shelf), `${shelf} stays`).toBe(true)
    await expect(page.locator(`${shelf} h2`).first()).toBeVisible()
  }
  expect(
    await page
      .locator('[data-boyo-vid="vid_old001"]')
      .getAttribute("data-boyo"),
    "the card that holds #home-mixed open is plated"
  ).toBe("plated")
  // The absent Short beside it still takes no space.
  expect(await laidOut(page, '[data-boyo-vid="sh_home03"]')).toBe(false)
  // The tile was never adopted, so nothing but the rule keeps it.
  expect(
    await page
      .locator('#home-tile yt-lockup-view-model:has(a[href="/@handle_tile"])')
      .getAttribute("data-boyo")
  ).toBeNull()
})

test("SH3: a pending card holds a shelf open; wrappers alone do not", async ({
  fixture,
}) => {
  // Built detached, so the content script never sees it: this is the
  // engine's reading of the selectors, with the stamps set by hand.
  const page = await fixture.goto("yt-shelves")
  const verdicts = await page.evaluate((rules) => {
    const shelf = document.createElement("ytd-rich-section-renderer")
    const short = (stamp: string | null): string =>
      `<ytd-rich-item-renderer><ytm-shorts-lockup-view-model-v2>
        <ytm-shorts-lockup-view-model${stamp === null ? "" : ` data-boyo="${stamp}"`}>
          <a href="/shorts/x"></a>
        </ytm-shorts-lockup-view-model>
      </ytm-shorts-lockup-view-model-v2></ytd-rich-item-renderer>`
    const collapses = (html: string): boolean => {
      shelf.innerHTML = html
      return rules.some((rule) => shelf.matches(rule))
    }
    return {
      allAbsent: collapses(short("absent") + short("absent")),
      pending: collapses(short("absent") + short(null)),
      plated: collapses(short("absent") + short("plated")),
      noneDecided: collapses(short(null) + short(null)),
    }
  }, SHELF_COLLAPSE_SELECTORS)

  expect(verdicts).toEqual({
    allAbsent: true,
    pending: false,
    plated: false,
    noneDecided: false,
  })
})
