/**
 * SF-RC4 (#1343) — interaction-state coverage, proven against the real
 * `--load-extension` build.
 *
 * The unit suite pins the wiring (which events schedule a pass, that a
 * burst collapses into one, that an unthemed page does nothing). It cannot
 * pin the thing this story is actually about: jsdom applies no stylesheet
 * rule to `getComputedStyle` at all, so a `:hover` colour swap does not
 * exist there. Only a real browser can show that the swap happens, that
 * nothing in this codebase's observation model sees it, and that the
 * settled-interaction pass repairs it anyway.
 *
 * The decision this story records is (a), bounded incremental — see the
 * issue for why, and `pipeline.ts`'s `INTERACTION_EVENTS` for the covered
 * set and the states explicitly *not* claimed.
 *
 * SF4 (#1360) classification: visual-claim, justified — the claim is about
 * colour resolution, which computed style reflects directly, with no
 * `filter` compositing involved.
 */

import { relativeLuminance } from "@filter/lib/content/color"
import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import type { Page } from "@playwright/test"

const MIN_CONTRAST_RATIO = 4.5

function channels(css: string): [number, number, number] {
  const match = css.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
  )
  if (match === null) throw new Error(`unparseable colour: ${css}`)
  const [, r, g, b, alpha] = match
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`unparseable colour: ${css}`)
  }
  if (alpha !== undefined && Number(alpha) < 1) {
    throw new Error(`expected an opaque colour, got: ${css}`)
  }
  return [Number(r) / 255, Number(g) / 255, Number(b) / 255]
}

function contrastOf(fgCss: string, bgCss: string): number {
  const fg = relativeLuminance(...channels(fgCss))
  const bg = relativeLuminance(...channels(bgCss))
  const [lighter, darker] = fg > bg ? [fg, bg] : [bg, fg]
  return (lighter + 0.05) / (darker + 0.05)
}

type Reading = {
  readonly repairKey: string | null
  readonly verdict: string | null
  readonly color: string
  readonly backdrop: string
}

async function read(page: Page, id: string): Promise<Reading> {
  return page.evaluate((elementId: string) => {
    const el = document.getElementById(elementId)
    const panel = document.getElementById("panel")
    if (el === null || panel === null) throw new Error("fixture missing")
    return {
      repairKey: el.getAttribute("data-sw-legibility-fix"),
      verdict: el.getAttribute("data-sw-legibility"),
      color: getComputedStyle(el).color,
      backdrop: getComputedStyle(panel).backgroundColor,
    }
  }, id)
}

/** Past `INTERACTION_SETTLE_MS` plus the pass itself, with margin. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(500)
}

test.describe("SF-RC4: a :hover-only colour swap is repaired (#1343)", () => {
  test("the carrier is untagged at rest, and repaired once hover settles", async ({
    fixture,
  }) => {
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    // The precondition matters as much as the claim: at rest this carrier
    // inherits its panel's already-corrected colour, so it is legitimately
    // not a candidate. Without asserting that, a pass that tagged
    // everything unconditionally would look like success.
    const atRest = await read(page, "hover-carrier")
    expect(
      atRest.repairKey,
      "at rest the carrier inherits a corrected colour and needs no repair"
    ).toBeNull()
    expect(contrastOf(atRest.color, atRest.backdrop)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO
    )

    await page.hover("#hover-carrier")
    await settle(page)

    const hovered = await read(page, "hover-carrier")
    expect(
      hovered.repairKey,
      "the :hover colour swap is a computed-style change with no mutation — " +
        "the settled-interaction pass is the only thing that can see it"
    ).not.toBeNull()

    const ratio = contrastOf(hovered.color, hovered.backdrop)
    expect(
      ratio,
      `hovered carrier renders ${hovered.color} on ${hovered.backdrop} — ` +
        `${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })

  test("a :focus-only colour swap is repaired too", async ({ fixture }) => {
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    expect((await read(page, "focus-carrier")).repairKey).toBeNull()

    await page.focus("#focus-carrier")
    await settle(page)

    const focused = await read(page, "focus-carrier")
    expect(
      focused.repairKey,
      "focusin/focusout are the bubbling counterparts delegation requires — " +
        "focus/blur would never reach a listener on document"
    ).not.toBeNull()
    expect(contrastOf(focused.color, focused.backdrop)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO
    )
  })

  test("a carrier with no interaction rule is left alone throughout", async ({
    fixture,
  }) => {
    // The control. An absence assertion, so a pass that indiscriminately
    // tagged every carrier it walked would fail here rather than read as a
    // success everywhere else.
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    await page.hover("#hover-carrier")
    await settle(page)
    await page.focus("#focus-carrier")
    await settle(page)

    const control = await read(page, "static-carrier")
    expect(control.repairKey).toBeNull()
    expect(control.verdict).toBeNull()
    expect(contrastOf(control.color, control.backdrop)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO
    )
  })

  test("the repair is dropped again once the interaction ends", async ({
    fixture,
  }) => {
    // `pointerout` schedules a pass too, so leaving the element re-derives
    // the resting verdict from the resting evidence — the carrier must not
    // keep a repair calibrated for a colour it no longer has. This is the
    // same fixed-point discipline (#831, Theorem 7.2) the rest of the
    // channel runs on, exercised across a state boundary.
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)
    await page.waitForTimeout(300)

    await page.hover("#hover-carrier")
    await settle(page)
    expect((await read(page, "hover-carrier")).repairKey).not.toBeNull()

    await page.hover("#static-carrier")
    await settle(page)

    const released = await read(page, "hover-carrier")
    expect(
      released.repairKey,
      "a repair must not outlive the state that justified it"
    ).toBeNull()
    expect(
      contrastOf(released.color, released.backdrop)
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})

test.describe("SF-RC4: interaction inside a shadow scope (#1343, bot-found)", () => {
  test("a :hover-only swap on a shadow-hosted carrier is repaired too", async ({
    fixture,
  }) => {
    // `auditLegibility`'s TreeWalker does not cross a shadow boundary, so
    // the document-scope pass covers the light DOM and nothing else. Without
    // the shadow half wired in, this story's stated hover/focus coverage
    // simply would not hold for web-component content — and the light-DOM
    // specs above would not notice.
    //
    // The scope's own stylesheet lives inside the root (a real web-component
    // pattern), so the rule is scoped there rather than inherited from the
    // document — a document `<style>` cannot select into a shadow tree at
    // all, which is the same encapsulation this whole epic keeps running
    // into.
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)

    await page.evaluate(() => {
      const host = document.createElement("div")
      host.id = "sf-rc4-host"
      const root = host.attachShadow({ mode: "open" })
      root.innerHTML =
        "<style>#shadow-carrier:hover { color: rgb(10, 10, 10); }</style>" +
        '<div id="shadow-panel" style="background-color:rgb(250,250,250);' +
        'color:rgb(40,40,40);padding:24px">' +
        '<div id="shadow-carrier">Hover changes this text\'s colour.</div>' +
        "</div>"
      document.body.appendChild(host)
    })

    await page.waitForFunction(
      () =>
        document
          .getElementById("sf-rc4-host")
          ?.shadowRoot?.getElementById("shadow-panel")
          ?.hasAttribute("data-sw-patched") === true,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    const readShadow = async (): Promise<Reading> =>
      page.evaluate(() => {
        const root = document.getElementById("sf-rc4-host")?.shadowRoot
        const el = root?.getElementById("shadow-carrier")
        const panel = root?.getElementById("shadow-panel")
        if (
          el === null ||
          el === undefined ||
          panel === null ||
          panel === undefined
        ) {
          throw new Error("shadow fixture missing")
        }
        return {
          repairKey: el.getAttribute("data-sw-legibility-fix"),
          verdict: el.getAttribute("data-sw-legibility"),
          color: getComputedStyle(el).color,
          backdrop: getComputedStyle(panel).backgroundColor,
        }
      })

    const atRest = await readShadow()
    expect(
      atRest.repairKey,
      "at rest the shadow carrier inherits a corrected colour"
    ).toBeNull()

    await page.hover("#sf-rc4-host >> nth=0")
    await page.evaluate(() => {
      const el = document
        .getElementById("sf-rc4-host")
        ?.shadowRoot?.getElementById("shadow-carrier")
      el?.dispatchEvent(
        new PointerEvent("pointerover", { bubbles: true, composed: true })
      )
    })
    await settle(page)

    const hovered = await readShadow()
    expect(
      hovered.repairKey,
      "the shadow half of the interaction pass must reach this carrier"
    ).not.toBeNull()
    const ratio = contrastOf(hovered.color, hovered.backdrop)
    expect(
      ratio,
      `shadow carrier renders ${hovered.color} on ${hovered.backdrop} — ` +
        `${ratio.toFixed(3)}:1`
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})

test.describe("SF-RC4: an interaction skipped by navigation is replayed (#1343, bot-found)", () => {
  test("a shadow carrier focused during an SPA transition is repaired the moment it finishes", async ({
    fixture,
  }) => {
    // The shadow half is skipped while a navigation is in flight — a carrier
    // whose backdrop resolves into the light DOM would otherwise be scored
    // against a document mid-replacement — and recorded so `yt-navigate-finish`
    // can replay it.
    //
    // The replay is a guarantee, not an observed necessity, and saying which
    // it is took two review rounds and an instrumented build. The structural
    // gap is real: `discover()` does not re-project a surviving root
    // (`walk()` registers only roots absent from `idFor`, and
    // `resetContent()` does not touch that map), so the only other route to
    // `recontrastAll()` here is `onFire`'s, gated on the round reporting a
    // write — and a navigation that wrote nothing would strand the scope.
    //
    // **What this spec does and does not prove, stated because two earlier
    // versions of it quietly proved nothing.** It asserts the end-to-end
    // outcome — a carrier interacted with across a navigation ends repaired
    // — and it cannot isolate the replay as the cause. Instrumenting which
    // caller actually repairs it showed `recontrastAll` running ~2ms after
    // `yt-navigate-finish` even with the replay removed: this codebase's
    // navigations *do* write, because nav-start's `reengage()` tears the
    // realization down and the finish-time rescan therefore re-realizes,
    // reports a write, and `onFire` fires `recontrastAll()` synchronously in
    // the same handler. So the replay is belt-and-braces on this path today
    // rather than the sole trigger, and no fixture can make it the cause
    // while that stays true.
    //
    // Two traps this went through, both worth not repeating: a half-second
    // wait let an *incidental* `pointerover` rescue it (tearing the veil down
    // changes the topmost element under the cursor, so the browser emits
    // pointer events with no pointer movement at all), and switching to focus
    // did not avoid that, because the rescue comes from the pointer whatever
    // the carrier's own state is. The tight window below at least excludes
    // that particular route: it is well under INTERACTION_SETTLE_MS, so an
    // interaction-scheduled pass cannot have landed yet.
    const page = await fixture.goto("interaction-state-page")
    await waitForClassification(page)

    await page.evaluate(() => {
      const host = document.createElement("div")
      host.id = "sf-rc4-nav-host"
      const root = host.attachShadow({ mode: "open" })
      root.innerHTML =
        "<style>#nav-carrier:focus { color: rgb(10, 10, 10); outline: none; }</style>" +
        '<div id="nav-panel" style="background-color:rgb(250,250,250);' +
        'color:rgb(40,40,40);padding:24px">' +
        '<div id="nav-carrier" tabindex="0">Focused across a navigation.</div>' +
        "</div>"
      document.body.appendChild(host)
    })

    await page.waitForFunction(
      () =>
        document
          .getElementById("sf-rc4-nav-host")
          ?.shadowRoot?.getElementById("nav-panel")
          ?.hasAttribute("data-sw-patched") === true,
      undefined,
      { timeout: 5_000, polling: 100 }
    )

    // Enter the navigation window *first*, then interact inside it, so the
    // settle timer is guaranteed to expire while `navigatingAway` holds. A
    // real `.focus()` call, not a synthetic `focusin`: the event alone
    // schedules a pass but never puts the element in `:focus`, so its colour
    // would never change and no repair would ever be warranted.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-start"))
      document
        .getElementById("sf-rc4-nav-host")
        ?.shadowRoot?.getElementById("nav-carrier")
        ?.focus()
    })
    await settle(page)

    const readCarrier = async (): Promise<{
      repairKey: string | null
      color: string
      backdrop: string
    }> =>
      page.evaluate(() => {
        const root = document.getElementById("sf-rc4-nav-host")?.shadowRoot
        const el = root?.getElementById("nav-carrier")
        const panel = root?.getElementById("nav-panel")
        if (
          el === null ||
          el === undefined ||
          panel === null ||
          panel === undefined
        ) {
          throw new Error("shadow fixture missing")
        }
        return {
          repairKey: el.getAttribute("data-sw-legibility-fix"),
          color: getComputedStyle(el).color,
          backdrop: getComputedStyle(panel).backgroundColor,
        }
      })

    expect(
      (await readCarrier()).repairKey,
      "the shadow half must be skipped mid-swap, not scored against a " +
        "document in the middle of being replaced"
    ).toBeNull()

    await page.evaluate(() => {
      window.dispatchEvent(new Event("yt-navigate-finish"))
    })
    // Deliberately well under INTERACTION_SETTLE_MS: only the synchronous
    // replay can have acted by now.
    await page.waitForTimeout(60)

    const afterNav = await readCarrier()
    expect(
      afterNav.repairKey,
      "a carrier interacted with across a navigation must end repaired, and " +
        "within the navigation's own handler rather than by a later " +
        "interaction-scheduled pass"
    ).not.toBeNull()
    expect(
      contrastOf(afterNav.color, afterNav.backdrop)
    ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO)
  })
})
