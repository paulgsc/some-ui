/**
 * HS1's measure: between two taps on one screen, a tap target still on the
 * screen keeps its box. A thumb and an eye aim where a control was a moment
 * ago, so a control that moved under them takes the next tap meant for
 * another (aph's keypad dropped 48px at the first digit typed).
 *
 * The geometry, as `./geometry.ts` asks: not the CSS that fixed one screen,
 * but the property every fix keeps. Block and flex layout is cumulative, so
 * anything a tap mounts, unmounts or resizes in flow moves whatever follows
 * it, and in a sheet anchored to the bottom, which grows upward, whatever
 * precedes it. The Layout Instability API does not see this: it leaves out
 * every shift within 500ms of an input (`hadRecentInput`), which is every
 * shift a tap causes, so a CLS budget passes a screen that moves under each
 * tap. This compares boxes instead.
 *
 * A box is measured where it sits in its scrolled content (its viewport box
 * plus every ancestor's scroll offset), so the scroll Playwright makes to
 * reach a control is not a move.
 */

import type { Page } from "@playwright/test"

/** What a thumb can hit. */
const TARGETS = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[role=button]",
  "[role=radio]",
  "[role=checkbox]",
  "[role=switch]",
  "[role=tab]",
].join(",")

/** Sub-pixel rounding at fractional zoom is not a move. */
const SLACK_PX = 0.5

type Box = { x: number; y: number; width: number; height: number }

type Target = { name: string; box: Box }

/** Every visible target on the page, by an id it keeps for the page's life. */
async function targetsOn(page: Page): Promise<Record<string, Target>> {
  return page.evaluate((selector: string) => {
    // The ids handed out so far, kept on the page so they last across reads.
    const ids = document.documentElement.dataset
    const found: Record<string, Target> = {}
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(selector)
    )) {
      if (!element.checkVisibility({ visibilityProperty: true })) continue
      // Behind an open sheet or dialog: hidden from the thumb as well.
      if (element.closest("[aria-hidden=true],[inert]")) continue
      let id = element.dataset["staysPut"]
      if (id === undefined) {
        id = String(Number(ids["staysPutNext"] ?? "0") + 1)
        ids["staysPutNext"] = id
        element.dataset["staysPut"] = id
      }
      let scrolledX = window.scrollX
      let scrolledY = window.scrollY
      for (let at = element.parentElement; at; at = at.parentElement) {
        scrolledX += at.scrollLeft
        scrolledY += at.scrollTop
      }
      const box = element.getBoundingClientRect()
      const name =
        element.getAttribute("aria-label") ??
        element.getAttribute("placeholder") ??
        element.textContent
      found[id] = {
        name: `<${element.tagName.toLowerCase()}> "${name.trim().slice(0, 40)}"`,
        box: {
          x: box.x + scrolledX,
          y: box.y + scrolledY,
          width: box.width,
          height: box.height,
        },
      }
    }
    return found
  }, TARGETS)
}

const moved = (a: Box, b: Box): boolean =>
  Math.abs(a.x - b.x) > SLACK_PX ||
  Math.abs(a.y - b.y) > SLACK_PX ||
  Math.abs(a.width - b.width) > SLACK_PX ||
  Math.abs(a.height - b.height) > SLACK_PX

const said = (box: Box): string =>
  `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`

/** One tap (or a few keys) on a screen, and whether it may move what stays. */
export type Tap = {
  /** What it does, in the screen's own words: the failure is headed by it. */
  readonly does: string
  readonly act: (page: Page) => Promise<void>
  /**
   * Only for a tap whose point is a new layout: another form or screen (a
   * mode switch), or more of a list (a disclosure). Says which, so the
   * exemption is read in review. A message, a preview or a refusal is never
   * one.
   */
  readonly reflows?: string
}

/**
 * Takes `taps` in order from where the page is. Returns one line per target
 * that a tap without `reflows` moved, said as the fix, headed
 * `<label>: <tap>`.
 */
export async function holdStill(
  page: Page,
  taps: ReadonlyArray<Tap>,
  label: string
): Promise<Array<string>> {
  const failures: Array<string> = []
  await settled(page)
  for (const tap of taps) {
    const before = await targetsOn(page)
    await tap.act(page)
    await settled(page)
    if (tap.reflows !== undefined) continue
    const after = await targetsOn(page)
    const moves: Array<string> = []
    for (const [id, was] of Object.entries(before)) {
      // Gone with the tap: nothing is left there to be tapped by mistake.
      if (!Object.hasOwn(after, id)) continue
      const now = after[id]
      if (!moved(was.box, now.box)) continue
      moves.push(`${was.name} from ${said(was.box)} to ${said(now.box)}`)
    }
    if (moves.length === 0) continue
    failures.push(
      `${label}: ${tap.does}: moved ${moves.length} ` +
        `${moves.length === 1 ? "target" : "targets"}, ` +
        `${moves.slice(0, 3).join("; ")}${moves.length > 3 ? "; …" : ""}. ` +
        `Something this tap brought up, took away or resized sits before ` +
        `them in the flow (or after them, in a sheet that grows up). Keep ` +
        `its room whether it shows or not (Reserved, @some-ui/shared), or ` +
        `put it after the last control.`
    )
  }
  return failures
}

/**
 * Waits for what a tap started (a sheet sliding in, a transition) to end: a
 * box read mid-slide is not where it rests.
 */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every(
      (animation) =>
        animation.playState !== "running" ||
        // A spinner or a pulse never ends, and moves no layout.
        animation.effect?.getComputedTiming().endTime === Infinity
    )
  )
  // One frame more, for a layout the last animation's end set off.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => done(null)))
  )
}
