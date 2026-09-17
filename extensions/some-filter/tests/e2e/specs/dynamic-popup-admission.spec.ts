/**
 * The leading-edge admission pass, proven against the real
 * `--load-extension` build.
 *
 * The unit suite pins this module's logic — which candidates a batch
 * offers, which keys are admissible, what the budgets do. It structurally
 * cannot pin the claim that actually matters, for the same reason the
 * SF-RC4 spec gives: jsdom has no stylesheets in `getComputedStyle`, no
 * rendering steps, and no `requestAnimationFrame` tied to a real frame. The
 * whole thesis here — *the tag lands before the frame the node was created
 * in paints* — is a statement about a browser's event loop, so only a
 * browser can hold it up.
 *
 * Measurement: sample the popup's computed background inside the first
 * `requestAnimationFrame` callback after the pointer event. A rAF callback
 * runs during that frame's rendering steps, before paint, so what it reads
 * is what the frame is about to show — not what settled some milliseconds
 * later. That distinction is the entire subject of these tests, so every
 * assertion here is anchored to it rather than to a post-hoc read.
 *
 * SF4 (#1360) classification: visual-claim, justified — the claim is about
 * colour resolution, which computed style reflects directly, with no
 * `filter` compositing involved.
 *
 * Which of these actually regression-lock the change, measured by building
 * with both halves disabled and re-running:
 *
 *   - "is already themed in the first frame it can paint in" — FAILS
 *     without the admission pass. This is the whole thesis.
 *   - "themes a role=menu popup in a colour no round has ever seen" —
 *     FAILS without the static layer's ARIA rule.
 *   - "binds it to exactly the tag …" — passes either way, and is meant to:
 *     it pins the *equivalence* of the two tagging paths, which is a
 *     contract that would be just as broken by an admission pass that
 *     spelled its own value as by one that did not exist.
 *   - "does not feed its own read back …" — passes either way, and is meant
 *     to: it is a #831 non-regression guard, so a build without admission
 *     passing it is the control, not a gap.
 *
 * Stated because a spec whose every test passes against the unpatched build
 * is a spec that proves nothing, and the only way to know which of these is
 * which is to have run it that way.
 */

import { expect, test, waitForClassification } from "@filter/playwright/fixture"
import type { Page } from "@playwright/test"

/** The vendor colour both the pre-existing card and the popup declare. */
const VENDOR_SURFACE = "rgb(238, 238, 238)"

/** The second committed colour — the pre-existing panel and the popup's item. */
const VENDOR_SURFACE_ALT = "rgb(221, 221, 221)"

/**
 * Long enough for every round the page load itself schedules to have fired.
 *
 * `waitForClassification` returns after the *first* round, and more follow
 * it unprompted (the veil teardown alone is a mutation). A baseline taken at
 * that point is a moving one, which is not a baseline.
 */
const SETTLE_MS = 800

type FirstFrameSample = {
  /** The popup's computed background during the first frame it could paint in. */
  readonly firstFrame: string
  /** The same element once the debounced round has certainly run. */
  readonly settled: string
  /** Whether the tag was already present in that first frame. */
  readonly taggedInFirstFrame: boolean
}

/**
 * Fires the pointer event that builds the popup, then reads the popup back
 * in the first rendering-steps callback that follows.
 *
 * Dispatched inside the page rather than via `page.hover()` deliberately:
 * the driver round-trip for a real hover is several milliseconds of
 * uncontrolled latency, easily enough to straddle the 50ms debounce this
 * test is trying to measure the *inside* of. Dispatching in-page puts the
 * mutation, the observer's microtask and the rAF read in one unbroken
 * sequence, which is the only way the measurement means what it says.
 */
async function sampleFirstFrame(page: Page): Promise<FirstFrameSample> {
  return page.evaluate(
    async () =>
      new Promise<FirstFrameSample>((resolve) => {
        const trigger = document.getElementById("trigger")
        if (trigger === null) throw new Error("fixture trigger missing")

        trigger.dispatchEvent(
          new PointerEvent("pointerover", { bubbles: true })
        )

        requestAnimationFrame(() => {
          const popup = document.getElementById("popup")
          if (popup === null) throw new Error("popup was never created")
          const firstFrame = getComputedStyle(popup).backgroundColor
          const taggedInFirstFrame = popup.hasAttribute("data-sw-patched")

          // Well past RECONCILE_POLICY's 50ms debounce plus a round.
          setTimeout(() => {
            resolve({
              firstFrame,
              settled: getComputedStyle(popup).backgroundColor,
              taggedInFirstFrame,
            })
          }, 600)
        })
      })
  )
}

test.describe("admission — a popup created on hover", () => {
  test("is already themed in the first frame it can paint in", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    const debug = await waitForClassification(page)
    expect(debug.themeApplied).toBe("dark")

    const sample = await sampleFirstFrame(page)

    // The claim, stated three ways so a failure says which half broke.
    expect(sample.taggedInFirstFrame).toBe(true)
    expect(sample.firstFrame).not.toBe(VENDOR_SURFACE)
    expect(sample.firstFrame).toBe(sample.settled)
  })

  test("binds it to exactly the tag the debounced round would have written", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)

    await sampleFirstFrame(page)

    // Admission's contract is that its tag is indistinguishable from the
    // round's. The pre-existing card and the hover-built popup declare the
    // same vendor colour, so they must carry the same key — if admission
    // ever spelled a value of its own, this is where the two would diverge.
    const tags = await page.evaluate(() => ({
      card: document.getElementById("card")?.dataset["swPatched"] ?? null,
      panel: document.getElementById("panel")?.dataset["swPatched"] ?? null,
      popup: document.getElementById("popup")?.dataset["swPatched"] ?? null,
      item:
        document
          .querySelector(".vendor-popup-item")
          ?.getAttribute("data-sw-patched") ?? null,
    }))

    expect(tags.card).toBe(VENDOR_SURFACE)
    expect(tags.popup).toBe(tags.card)
    // The subtree, not just the added node — a popper's carriers are its
    // descendants far more often than its root. The item declares the
    // *panel's* colour rather than the popup's, so a pass that only ever
    // tagged added roots (or only ever resolved one key per batch) fails
    // here rather than passing by coincidence.
    expect(tags.panel).toBe(VENDOR_SURFACE_ALT)
    expect(tags.item).toBe(tags.panel)
  })

  test("does not feed its own read back into the hypothesis", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)
    await page.waitForTimeout(SETTLE_MS)

    const before = await page.evaluate(
      () =>
        document.getElementById("__sw_dark_dynamic")?.textContent.length ?? 0
    )

    await sampleFirstFrame(page)

    // #831's shape: admission reads a colour and writes a tag. If that read
    // ever became evidence, the dynamic sheet would grow a rule for
    // something only the extension itself painted, and the page would walk
    // its own verdict back. The sheet must be untouched — the popup bound
    // to a rule that was already in it.
    const after = await page.evaluate(() => ({
      dynamicLength:
        document.getElementById("__sw_dark_dynamic")?.textContent.length ?? 0,
      stillDark: document.documentElement.hasAttribute("data-sw-dark"),
    }))

    expect(after.dynamicLength).toBe(before)
    expect(after.stillDark).toBe(true)
  })
})

test.describe("admission — the static layer's ARIA popup rule", () => {
  /**
   * The other half, and the one admission cannot cover: a popup whose
   * colour the page has never shown before has no committed key to bind
   * to. A selector does not care — it was in the cascade before the element
   * existed.
   */
  test("themes a role=menu popup in a colour no round has ever seen", async ({
    fixture,
  }) => {
    const page = await fixture.goto("dynamic-popup-page")
    await waitForClassification(page)

    const sample = await page.evaluate(
      async () =>
        new Promise<{ firstFrame: string; tagged: boolean }>((resolve) => {
          const menu = document.createElement("div")
          menu.id = "aria-menu"
          menu.setAttribute("role", "menu")
          // A colour deliberately absent from the fixture, so no
          // emit-surface-color rule for it can exist and admission is
          // guaranteed to decline.
          menu.style.backgroundColor = "rgb(252, 249, 240)"
          menu.style.position = "absolute"
          menu.style.top = "300px"
          document.body.appendChild(menu)

          requestAnimationFrame(() => {
            resolve({
              firstFrame: getComputedStyle(menu).backgroundColor,
              tagged: menu.hasAttribute("data-sw-patched"),
            })
          })
        })
    )

    // Untagged — admission correctly declined an uncommitted key — and dark
    // anyway, which is the entire point of the prospective half.
    expect(sample.tagged).toBe(false)
    expect(sample.firstFrame).not.toBe("rgb(252, 249, 240)")
  })
})
