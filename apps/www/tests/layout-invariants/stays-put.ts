/**
 * HS1's measure (`docs/ui-fit/README.md` 2i), the property every fix keeps,
 * as `./geometry.ts` asks, not the CSS that fixed one screen:
 *
 * - between two taps on one screen, a tap target still on the screen keeps
 *   its box (a tap that `grows` the screen may move only what is below it);
 * - what the app says (an element with `role="alert"` or `role="status"`)
 *   takes no room in the screen: it is on the notice plane
 *   (`[data-notice-plane]`, `Notice` in @some-ui/shared), or it says nothing
 *   and is drawn as nothing.
 *
 * A box is measured where it sits in its scrolled content (its viewport box
 * plus every ancestor's scroll offset), so the scroll Playwright makes to
 * reach a control is not a move.
 */

import type { Locator, Page } from "@playwright/test"

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

export type Box = { x: number; y: number; width: number; height: number }

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

/** Whether `b` is not where `a` was, past sub-pixel rounding. */
export const moved = (a: Box, b: Box): boolean =>
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
   * Only for a tap whose point is a new layout: another screen, or another
   * form of this one (a mode switch). Says which, so the exemption is read
   * in review. A message, a preview or a refusal is never one.
   */
  readonly reflows?: string
  /**
   * Only for a tap that asks for more of the screen below what was tapped (a
   * translation, the rest of a list): what is below it may move, and it and
   * everything above it may not. Says what grows.
   */
  readonly grows?: string
  /** The control tapped, which a tap that `grows` measures from. */
  readonly target?: (page: Page) => Locator
}

/** Where a tap looks for its control: the page, or a part of it (a sheet). */
export type Scope = (page: Page) => Pick<Page, "getByRole">

const onPage: Scope = (page) => page

/**
 * A tap on the first button named `name`: a string is any part of its name
 * unless `exact`, a pattern a match.
 */
export const button = (
  name: string | RegExp,
  does: string,
  { scope = onPage, exact }: { scope?: Scope; exact?: boolean } = {}
): Tap => {
  const target = (page: Page): Locator =>
    scope(page).getByRole("button", { name, exact }).first()
  return { does, target, act: (page) => target(page).click() }
}

/** A tap onto another screen: a new layout, so nothing is held. */
export const toScreen = (name: string | RegExp, does: string): Tap => ({
  ...button(name, does),
  reflows: `screen: ${does}`,
})

/** Closes the first notice on a notice plane that can be closed. */
export const putAway = (does: string): Tap =>
  button("Dismiss", does, {
    scope: (page) => page.locator("[data-notice-plane]"),
    exact: true,
  })

/** A file a walk picks from storage: its name and what it holds. */
export type Picked = {
  readonly name: string
  readonly mimeType: string
  readonly body: string
}

/**
 * Picks `files` (a path on disk, or files by name) from storage, in the
 * input labelled `into` or else the screen's one, then waits for what `says`
 * finds, when given, to show.
 */
export const picksFile = (
  files: string | Picked | ReadonlyArray<Picked>,
  does: string,
  {
    into,
    says,
    reflows,
  }: {
    into?: string
    says?: (page: Page) => Locator
    reflows?: string
  } = {}
): Tap => ({
  does,
  ...(reflows === undefined ? {} : { reflows }),
  act: async (page): Promise<void> => {
    const input =
      into === undefined
        ? page.locator("input[type=file]")
        : page.getByLabel(into)
    await input.setInputFiles(
      typeof files === "string"
        ? files
        : [files].flat().map(({ name, mimeType, body }) => ({
            name,
            mimeType,
            buffer: Buffer.from(body),
          }))
    )
    if (says !== undefined) await says(page).first().waitFor()
  },
})

/**
 * Waits for what `found` finds to show, so the next tap starts from a still
 * screen: what landed while nothing was tapped is measured too.
 */
export const waitsFor = (
  found: (page: Page) => Locator,
  does: string
): Tap => ({
  does,
  act: (page) => found(page).first().waitFor(),
})

/** From here on, the phone keeps nothing: every write is refused. */
export const refuseWrites: Tap = {
  does: "the phone stops keeping writes",
  act: (page): Promise<void> =>
    page.evaluate(() => {
      if (!Reflect.has(window, "__keptSetItem")) {
        Reflect.set(window, "__keptSetItem", Storage.prototype.setItem)
      }
      Storage.prototype.setItem = (): never => {
        throw new DOMException("full", "QuotaExceededError")
      }
    }),
}

/** The phone keeps writes again, after `refuseWrites`. */
export const keepWrites: Tap = {
  does: "the phone keeps writes again",
  act: (page): Promise<void> =>
    page.evaluate(() => {
      const kept: unknown = Reflect.get(window, "__keptSetItem")
      if (typeof kept === "function") {
        Reflect.set(Storage.prototype, "setItem", kept)
      }
    }),
}

/** Each element that speaks in the screen's flow, by its stays-put id. */
async function speakingInFlow(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const ids = document.documentElement.dataset
    const found: Record<string, string> = {}
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>("[role=alert],[role=status]")
    )) {
      if (element.closest("[data-notice-plane]")) continue
      if (!element.checkVisibility({ visibilityProperty: true })) continue
      const box = element.getBoundingClientRect()
      // Drawn as nothing: an empty region that takes no room moves nothing.
      if (box.width === 0 || box.height === 0) continue
      let id = element.dataset["staysPut"]
      if (id === undefined) {
        id = String(Number(ids["staysPutNext"] ?? "0") + 1)
        ids["staysPutNext"] = id
        element.dataset["staysPut"] = id
      }
      const words = element.textContent.trim().slice(0, 60)
      found[id] =
        `<${element.tagName.toLowerCase()} role="${element.getAttribute("role") ?? ""}"> ${
          words === "" ? "(empty, holding room)" : `"${words}"`
        }`
    }
    return found
  })
}

/**
 * Takes `taps` in order from where the page is. Returns one line per tap that
 * moved a target it should not have, and one per message that spoke in the
 * screen's flow, said as the fix, headed `<label>: <tap>`.
 */
export async function holdStill(
  page: Page,
  taps: ReadonlyArray<Tap>,
  label: string
): Promise<Array<string>> {
  const failures: Array<string> = []
  const spoke = new Set<string>()
  const heard = async (after: string): Promise<void> => {
    for (const [id, what] of Object.entries(await speakingInFlow(page))) {
      if (spoke.has(id)) continue
      spoke.add(id)
      failures.push(
        `${label}: ${after}: ${what} takes room in the screen. What the app ` +
          `says about what was just done goes on the notice plane, over the ` +
          `screen (Notice, @some-ui/shared): never a line in the layout, and ` +
          `never a blank kept for one.`
      )
    }
  }
  await settled(page)
  await heard("on opening")
  for (const tap of taps) {
    const before = await targetsOn(page)
    const from =
      tap.grows === undefined || tap.target === undefined
        ? null
        : await tap.target(page).getAttribute("data-stays-put")
    await tap.act(page)
    await settled(page)
    await heard(tap.does)
    if (tap.reflows !== undefined) continue
    // A tap that grows the screen below it holds what is at and above it.
    const below =
      from !== null && Object.hasOwn(before, from)
        ? before[from].box.y + before[from].box.height
        : Infinity
    const after = await targetsOn(page)
    const moves: Array<string> = []
    for (const [id, was] of Object.entries(before)) {
      // Gone with the tap: nothing is left there to be tapped by mistake.
      if (!Object.hasOwn(after, id)) continue
      if (was.box.y >= below) continue
      const now = after[id]
      if (!moved(was.box, now.box)) continue
      moves.push(`${was.name} from ${said(was.box)} to ${said(now.box)}`)
    }
    if (moves.length === 0) continue
    failures.push(
      `${label}: ${tap.does}: moved ${moves.length} ` +
        `${moves.length === 1 ? "target" : "targets"}, ` +
        `${moves.slice(0, 3).join("; ")}${moves.length > 3 ? "; …" : ""}. ` +
        `The screen changed its layout under a person still using it. Say ` +
        `what the tap answers on the notice plane (Notice, @some-ui/shared); ` +
        `keep a control that cannot be used now in its place, disabled; and ` +
        `give a word that changes one width (SameWidth).`
    )
  }
  return failures
}

/**
 * Waits for what a tap started (a sheet sliding in, a transition) to end: a
 * box read mid-slide is not where it rests.
 */
async function settled(page: Page): Promise<void> {
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
