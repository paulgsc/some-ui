/**
 * BOYO — a shelf whose every card is absent goes with its cards (QD11)
 *
 * SH1 — An all-absent shelf leaves no header and takes no space, on home,
 *       search and a channel page, and a search shelf's neighbours stay.
 * SH2 — A shelf with a plated card, or with a tile no content script takes,
 *       stays, header and all.
 * SH3 — On a real engine, a card not adopted yet, a post or a channel tile
 *       holds a shelf open.
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
  "vid_srch_a",
  "vid_srch_b",
  "sh_chan01",
  "sh_chan02",
  "vid_pl001",
  "vid_pl002",
  "vid_old002",
  "vid_pl102",
] as const

async function display(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((el) => getComputedStyle(el).display)
}

test("SH1: an all-absent shelf leaves no header and no gap", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-shelves")
  await fixture.pollDebug(page, (d) => CARDS.every((id) => id in d.entries))

  for (const shelf of [
    "#home-shorts",
    "#search-shorts",
    "#channel-shorts",
    "#channel-playlist",
  ]) {
    expect(await display(page, shelf), shelf).toBe("none")
  }
  expect(await page.locator("#search-after").boundingBox()).not.toBeNull()
})

test("SH2: a shelf with a plated card or a non-video tile stays", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-shelves")
  const snap = await fixture.pollDebug(page, (d) =>
    CARDS.every((id) => id in d.entries)
  )
  expect(snap.entries["vid_old001"]?.viewKind).toBe("plated")

  for (const shelf of ["#home-mixed", "#home-tile", "#channel-kept"]) {
    await expect(page.locator(`${shelf} h2`).first()).toBeVisible()
  }
  // Nothing but the rule keeps the tile: it was never adopted.
  expect(
    await page
      .locator('#home-tile yt-lockup-view-model:has(a[href="/@handle_tile"])')
      .getAttribute("data-boyo")
  ).toBeNull()
})

test("SH3: a pending card, a post or a channel tile holds a shelf open", async ({
  fixture,
}) => {
  // Built detached, so the content script never sees it: the engine's own
  // reading of the selectors, with the stamps set by hand.
  const page = await fixture.goto("yt-shelves")
  const verdicts = await page.evaluate((rules) => {
    const absent =
      '<yt-lockup-view-model data-boyo="absent"><a href="/watch?v=a"></a></yt-lockup-view-model>'
    const collapses = (tag: string, html: string): boolean => {
      const shelf = document.createElement(tag)
      shelf.innerHTML = html
      return rules.some((rule) => shelf.matches(rule))
    }
    const home = (tile: string): string =>
      `<ytd-rich-item-renderer><div id="content">${absent}</div></ytd-rich-item-renderer>
       <ytd-rich-item-renderer><div id="content">${tile}</div></ytd-rich-item-renderer>`
    const channel = (tile: string): string =>
      `<div id="contents"><ytd-shelf-renderer><yt-horizontal-list-renderer>
        <div id="items">${absent}${tile}</div>
      </yt-horizontal-list-renderer></ytd-shelf-renderer></div>`
    return {
      control: collapses("ytd-rich-section-renderer", home(absent)),
      pending: collapses(
        "ytd-rich-section-renderer",
        home(
          '<yt-lockup-view-model><a href="/watch?v=p"></a></yt-lockup-view-model>'
        )
      ),
      post: collapses(
        "ytd-rich-section-renderer",
        home("<ytd-post-renderer></ytd-post-renderer>")
      ),
      channelTile: collapses(
        "ytd-item-section-renderer",
        channel("<ytd-grid-channel-renderer></ytd-grid-channel-renderer>")
      ),
    }
  }, SHELF_COLLAPSE_SELECTORS)

  expect(verdicts).toEqual({
    control: true,
    pending: false,
    post: false,
    channelTile: false,
  })
})
