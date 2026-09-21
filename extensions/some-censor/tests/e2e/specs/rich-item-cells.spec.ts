/**
 * BOYO — the home feed's polymorphic grid cell (#1422, [ORP1])
 *
 * `ytd-rich-item-renderer` wraps whatever the feed item is: a video, but also
 * an ad slot, a Shorts shelf, a community post. It used to be catalogued as a
 * plain video tag, so a non-video cell was occluded by the pre-mask rule,
 * could never produce a videoId, and was never released — a permanently
 * blurred, permanently unclickable tile — while keeping the retry loop alive
 * for the life of the tab.
 *
 * O1 — A non-video cell is neither adopted nor left under the occluder.
 * O2 — A video cell is still pre-masked at first paint: the guard that fixes
 *      O1 must not open a window where a real card paints unoccluded.
 * O3 — The non-video cell does not keep the retry loop alive.
 * O4 — A cell that *contains* a card is a wrapper, not a card: the lockup
 *      inside is masked, the cell is neither adopted nor occluded.
 * O5 — The stylesheet's pre-mask condition and `classifyCard()` agree on
 *      every catalogue element, on a real engine — the unit suite cannot
 *      check this, because jsdom cannot parse `:not(:has())`.
 * O6 — A cell inserted atomically with its lockup already inside is handled
 *      through the live observer: the lockup is adopted, the cell is not.
 * O7 — An adopted cell handed to an ad slot in place is retired: no stale
 *      stamp, no veil, and not under the occluder either.
 * O8 — An adopted cell wrapped around a lockup in place is retired, and the
 *      lockup becomes the card.
 * O9 — The same, when the lockup carries the *same* video as the cell did:
 *      the cell's entry must not be repaired in place of adopting the lockup.
 */

import {
  CARD_SELECTORS,
  PREMASK_SELECTORS,
  SEL,
  VIDEO_LINK_SELECTOR,
} from "@censor/lib/content/selectors"
import { expect, test } from "@censor/playwright/fixture"

const GRID_VIDEOS = ["vid_aaa111", "vid_bbb222", "vid_ccc333"] as const

test("O1: a non-video rich-item cell is neither masked nor left blurred", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // Wait for the real cards to settle, so this is "the extension has run and
  // chose not to take it", not "the extension has not got there yet".
  await fixture.pollDebug(
    page,
    (d) => GRID_VIDEOS.every((id) => id in d.entries),
    { timeout: 5000 }
  )

  expect(
    await fixture.fixtureCall<boolean>(page, "isMaskedById", "ad-slot-card"),
    "an ad cell must not be adopted"
  ).toBe(false)

  expect(
    await fixture.fixtureCall<boolean>(page, "isPreMasked", "ad-slot-card"),
    "…and must not be left under the pre-mask occluder either"
  ).toBe(false)

  // Rendered, not inferred: the occluder's own `pointer-events: none` is what
  // made the reported tile unclickable.
  const pointerEvents = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("ad-slot-card")!).pointerEvents
  )
  expect(pointerEvents, "the cell still takes pointer events").not.toBe("none")
})

test("O2: a video rich-item cell IS pre-masked before its veil arrives", async ({
  fixture,
}) => {
  // The other side of the same guard: `:has()` on this tag must not be so
  // narrow that it stops protecting real cards. Once the veil is up the static
  // filter is lifted by [data-boyo], so this asserts the rule matches the
  // element rather than sampling a race — the same shape as L2.
  const page = await fixture.goto("yt-home")
  const matches = await page.evaluate(() =>
    document
      .querySelector(
        'ytd-rich-item-renderer:has(a[href*="/watch?v=vid_aaa111"])'
      )
      ?.matches(
        'ytd-rich-item-renderer:has(a[href*="/watch"], a[href*="/shorts/"])'
      )
  )
  expect(matches).toBe(true)
})

test("O3: the non-video cell does not keep the retry loop alive", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")

  // The ad cell can never resolve. It used to be retried at 500ms forever,
  // each pass re-scanning the whole document. The budget is ~10s, so by 15s
  // the queue must have drained with the cell released from it.
  const snap = await fixture.pollDebug(page, (d) => d.unresolved === 0, {
    timeout: 15_000,
  })
  expect(snap.unresolved).toBe(0)
  expect(
    await fixture.fixtureCall<boolean>(page, "isMaskedById", "ad-slot-card"),
    "released, not adopted"
  ).toBe(false)
})

test("O4: a cell wrapping a lockup is released, and the lockup is the card", async ({
  fixture,
}) => {
  // #1426's DOM fact, and #1504's own review: the grid cell contains the
  // lockup's watch links, so a link check alone would adopt the cell as one
  // card with one veil over the lockup — and the cell's `pointer-events:
  // none` under the occluder would make that veil unclickable anyway.
  const page = await fixture.goto("yt-home")

  const snap = await fixture.pollDebug(
    page,
    (d) => "lock_nested" in d.entries,
    {
      timeout: 5000,
    }
  )
  expect(snap.entries["lock_nested"]?.viewKind).toBe("masked")

  const adopted = await page.evaluate(() => ({
    inner: document.getElementById("nested-inner")?.getAttribute("data-boyo"),
    outer: document.getElementById("nested-outer")?.hasAttribute("data-boyo"),
    innerVeils: document
      .getElementById("nested-inner")
      ?.querySelectorAll(".boyo-veil").length,
    outerVeils: document
      .getElementById("nested-outer")
      ?.querySelectorAll(".boyo-veil").length,
  }))
  expect(adopted.inner, "the lockup is the card").toBe("0")
  expect(adopted.outer, "the cell is not adopted").toBe(false)
  expect(adopted.innerVeils, "exactly one veil, on the lockup").toBe(1)
  expect(adopted.outerVeils, "and none anywhere else in the cell").toBe(1)

  expect(
    await fixture.fixtureCall<boolean>(page, "isPreMasked", "nested-outer"),
    "the cell is not left under the occluder"
  ).toBe(false)
  const pointerEvents = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("nested-outer")!).pointerEvents
  )
  expect(pointerEvents, "so the veil inside it is clickable").not.toBe("none")
})

test("O5: the stylesheet and classifyCard() agree on every catalogue element", async ({
  fixture,
}) => {
  // `occludedElements()` spells the pre-mask condition in TypeScript because
  // jsdom cannot parse the CSS form. This is the rendered-engine check that
  // the two spellings are the same condition: for every element matching
  // SEL, the engine's own `matches()` of that tag's pre-mask selector must
  // equal the predicate — evaluated *before* the content script stamps
  // anything, so both sides see the raw page.
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => d.mounted >= 3, { timeout: 5000 })

  const disagreements = await page.evaluate(
    ({ sel, videoLink, guarded, premask }) => {
      const out: Array<string> = []
      for (const el of document.querySelectorAll(sel)) {
        const tag = el.tagName.toLowerCase()
        const selector = premask[tag]
        if (selector === undefined) {
          out.push(`${tag}: no pre-mask selector`)
          continue
        }
        // classifyCard() === "card" && no data-boyo, spelled here.
        const isCard = guarded.includes(tag)
          ? el.querySelector(sel) === null &&
            el.querySelector(videoLink) !== null
          : true
        const predicate = isCard && !el.hasAttribute("data-boyo")
        const css = el.matches(selector)
        if (css !== predicate) {
          out.push(
            `${tag}#${el.id || "?"}: css=${String(css)} predicate=${String(predicate)}`
          )
        }
      }
      return out
    },
    {
      sel: SEL,
      videoLink: VIDEO_LINK_SELECTOR,
      guarded: CARD_SELECTORS.filter((s) => s.requiresVideoLink).map(
        (s) => s.tag
      ),
      premask: Object.fromEntries(
        CARD_SELECTORS.map((s, i) => [s.tag, PREMASK_SELECTORS[i]])
      ),
    }
  )
  expect(disagreements).toEqual([])
})

test("O6: a cell inserted with its lockup already inside is handled by the observer", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => d.mounted >= 3, { timeout: 5000 })
  // The retry loop may or may not be alive here; the observer alone has to
  // do this, which is why the unit suite drives it without a scan.
  await fixture.fixtureCall<boolean>(
    page,
    "appendNestedCell",
    "lock_late",
    "late-cell"
  )

  const snap = await fixture.pollDebug(page, (d) => "lock_late" in d.entries, {
    timeout: 5000,
  })
  expect(snap.entries["lock_late"]?.viewKind).toBe("masked")
  expect(
    await fixture.fixtureCall<boolean>(page, "isMaskedById", "late-cell-inner"),
    "the lockup is the card"
  ).toBe(true)
  expect(
    await fixture.fixtureCall<boolean>(page, "isMaskedById", "late-cell"),
    "the cell is not adopted"
  ).toBe(false)
  expect(
    await fixture.fixtureCall<boolean>(page, "isPreMasked", "late-cell"),
    "and not under the occluder"
  ).toBe(false)
})

test("O7: an adopted cell handed to an ad slot in place is retired", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => "vid_ccc333" in d.entries, {
    timeout: 5000,
  })

  await fixture.fixtureCall<boolean>(page, "turnCardIntoAd", "vid_ccc333")

  const snap = await fixture.pollDebug(
    page,
    (d) => !("vid_ccc333" in d.entries),
    { timeout: 5000 }
  )
  expect(snap.entries["vid_ccc333"], "the entry is gone").toBeUndefined()

  const cell = await page.evaluate(() => {
    const el = document.querySelector(
      "ytd-rich-item-renderer:has(ytd-ad-slot-renderer)"
    )
    if (!(el instanceof HTMLElement)) return null
    const cs = getComputedStyle(el)
    return {
      stamped: el.hasAttribute("data-boyo"),
      veils: el.querySelectorAll(".boyo-veil").length,
      blurred: cs.filter.includes("blur"),
      pointerEvents: cs.pointerEvents,
    }
  })
  expect(cell).not.toBeNull()
  expect(cell?.stamped, "no stale stamp").toBe(false)
  expect(cell?.veils, "no veil").toBe(0)
  expect(cell?.blurred, "not under the occluder").toBe(false)
  expect(cell?.pointerEvents).not.toBe("none")
})

test("O8: an adopted cell wrapped around a lockup in place is retired, and the lockup is the card", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => "vid_bbb222" in d.entries, {
    timeout: 5000,
  })

  await fixture.fixtureCall<boolean>(
    page,
    "wrapCardInLockup",
    "vid_bbb222",
    "lock_wrapped",
    "wrapped-inner"
  )

  const snap = await fixture.pollDebug(
    page,
    (d) => "lock_wrapped" in d.entries && !("vid_bbb222" in d.entries),
    { timeout: 5000 }
  )
  expect(snap.entries["lock_wrapped"]?.viewKind).toBe("masked")

  const shape = await page.evaluate(() => {
    const inner = document.getElementById("wrapped-inner")
    const outer = inner?.parentElement
    if (!inner || !(outer instanceof HTMLElement)) return null
    return {
      innerStamp: inner.getAttribute("data-boyo"),
      outerStamped: outer.hasAttribute("data-boyo"),
      outerOwnVeils: outer.querySelectorAll(":scope > .boyo-veil").length,
      innerVeils: inner.querySelectorAll(".boyo-veil").length,
      outerBlurred: getComputedStyle(outer).filter.includes("blur"),
    }
  })
  expect(shape).not.toBeNull()
  expect(shape?.innerStamp, "the lockup is masked").toBe("0")
  expect(shape?.innerVeils).toBe(1)
  expect(shape?.outerStamped, "the cell's stamp is retired").toBe(false)
  expect(shape?.outerOwnVeils, "and its veil is gone").toBe(0)
  expect(shape?.outerBlurred, "and it is not under the occluder").toBe(false)
})

test("O9: a cell wrapped around a lockup for the same video hands the card to the lockup", async ({
  fixture,
}) => {
  const page = await fixture.goto("yt-home")
  await fixture.pollDebug(page, (d) => "vid_aaa111" in d.entries, {
    timeout: 5000,
  })

  await fixture.fixtureCall<boolean>(
    page,
    "wrapCardInLockup",
    "vid_aaa111",
    "vid_aaa111",
    "same-inner"
  )

  // The entry keeps its id, so the debug snapshot cannot tell the two apart;
  // the rendered stamps can.
  await page.waitForFunction(
    () =>
      document.getElementById("same-inner")?.getAttribute("data-boyo") === "0",
    undefined,
    { timeout: 5000 }
  )
  const shape = await page.evaluate(() => {
    const inner = document.getElementById("same-inner")
    const outer = inner?.parentElement
    if (!inner || !(outer instanceof HTMLElement)) return null
    return {
      outerStamped: outer.hasAttribute("data-boyo"),
      outerOwnVeils: outer.querySelectorAll(":scope > .boyo-veil").length,
      innerVeils: inner.querySelectorAll(".boyo-veil").length,
      outerBlurred: getComputedStyle(outer).filter.includes("blur"),
      innerBlurred: getComputedStyle(inner).filter.includes("blur"),
    }
  })
  expect(shape).not.toBeNull()
  expect(shape?.innerVeils, "the lockup carries the veil").toBe(1)
  expect(shape?.innerBlurred, "and is not under the occluder").toBe(false)
  expect(shape?.outerStamped, "the cell's stamp is retired").toBe(false)
  expect(shape?.outerOwnVeils).toBe(0)
  expect(shape?.outerBlurred).toBe(false)
})
