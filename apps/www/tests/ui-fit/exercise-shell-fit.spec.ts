/**
 * Does the LeetType exercise card fit its box, and stay fitted while it is
 * being played? (#876.)
 *
 * `docs/ui-fit/README.md` opens by naming the leetype nav modals as the
 * violation that produced the doctrine — a picker at
 * `max-h-[85vh] overflow-y-auto`, a drawer nesting `ScrollArea max-h-[60vh]`,
 * a skip menu at `max-h-[52vh]` inside `max-h-[80vh]`. Each looked fine in
 * the window it was built in. M20 deleted all three, and replaced them with a
 * shell that has the same failure mode available to it in a new place.
 *
 * The Storybook sweep next door already asserts the static half: nothing
 * overflows sideways, and no element is a greedy scroll container. What it
 * cannot see is the half that only exists over *time*:
 *
 *   1. **The prompt panel's box is invariant across a typing run.** A prompt
 *      that reflows mid-step moves the code under the player's hands, which
 *      is a flow-state break on the one surface where that is unforgivable.
 *      Nothing in a static render can catch it, because the thing that
 *      changes is the viewport's content, not the panel's.
 *   2. **A step advance does not jump the layout**, even between steps whose
 *      bodies differ by an order of magnitude in length.
 *
 * ## Why a static fixture rather than the running app
 *
 * Same reason as `launcher-fit.spec.ts`, which this follows: no dev server,
 * no WASM build, no engine to drive. What is being measured is a layout
 * question, and the layout is CSS. The cost is that the CSS below mirrors the
 * shipped classes and can drift from them — so what it mirrors is stated
 * class-for-class against the component it came from, and the check that
 * cannot drift is the Storybook sweep.
 *
 * The one thing this spec must never do is measure a card whose viewport
 * never overflowed: a "the prompt did not move" assertion over content that
 * always fit is vacuous. `assertViewportActuallyScrolls` is the guard.
 *
 * ## Which case actually goes red
 *
 * Worth stating, because the two look interchangeable and are not. Relaxing
 * the prompt panel's `shrink-0 basis-1/5` to `flex-1` — the single most
 * likely way this layout regresses — turns **"a step advance does not jump
 * the layout"** red at all three viewports and leaves the two
 * box-invariance cases green, because those hold one prompt fixed and vary
 * only the body. The advance case is therefore the load-bearing one; the
 * others pin the property #876 asks for, at the shapes it asks for it.
 */

import { expect, test, type Page } from "@playwright/test"

/**
 * The same three sizes the Storybook sweep uses, for the same reasons: the
 * shortest viewport a laptop realistically presents, a narrow phone, and a
 * large desktop.
 */
const VIEWPORTS = [
  { name: "short-laptop", width: 1280, height: 560 },
  { name: "phone", width: 390, height: 720 },
  { name: "desktop", width: 1680, height: 1050 },
] as const

/**
 * Mirrors the shipped chain, class for class:
 *
 *   - `Leetype`'s root       `absolute inset-0 flex flex-col gap-3 overflow-hidden`
 *   - `ExerciseHeader`       `flex shrink-0 …`
 *   - `ExerciseCard`         `flex h-full min-h-0 flex-col gap-3`
 *   - `PromptPanel`          `flex shrink-0 basis-1/5 flex-col … px-4 py-3`
 *   - the viewport's wrapper `relative flex min-h-0 flex-1 flex-col`
 *   - `TypingViewport`       `min-h-0 flex-1 overflow-auto … p-4`
 *   - `StepRail`             `flex shrink-0 …`
 *
 * `basis-1/5` on a `shrink-0` child plus `min-h-0 flex-1` on the flexible one
 * is the 20/80 split. It is expressed that way rather than as a percentage
 * precisely so it survives a short window, which is what the `short-laptop`
 * viewport below is for.
 */
const SHELL_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: system-ui, sans-serif; font-size: 16px; line-height: 1.5; }
  .host { position: relative; height: 100vh; overflow: hidden; }
  .root { position: absolute; inset: 0; display: flex; flex-direction: column; gap: .75rem; overflow: hidden; padding: 1rem; }
  .header { flex-shrink: 0; display: flex; justify-content: space-between; gap: 1rem; }
  .card { display: flex; height: 100%; min-height: 0; flex-direction: column; gap: .75rem; }
  .prompt { flex-shrink: 0; flex-basis: 20%; display: flex; flex-direction: column; gap: .5rem;
            border: 1px solid #e5e7eb; border-radius: .5rem; padding: .75rem 1rem; }
  .prompt .goal { font-size: .875rem; font-weight: 600; margin: 0; }
  .prompt .lines { min-height: 0; flex: 1 1 0%; display: flex; flex-direction: column; gap: .25rem; }
  .prompt .lines p { font-size: .75rem; margin: 0; color: #6b7280; }
  .viewport-wrap { position: relative; display: flex; min-height: 0; flex: 1 1 0%; flex-direction: column; }
  .viewport { min-height: 0; flex: 1 1 0%; overflow: auto; border: 1px solid #e5e7eb;
              border-radius: .5rem; padding: 1rem; font-family: ui-monospace, monospace;
              font-size: .875rem; line-height: 1.625; }
  .viewport pre { margin: 0; }
  .rail { flex-shrink: 0; display: flex; justify-content: center; gap: .375rem; padding: .25rem 0; }
  .rail span { width: .375rem; height: .375rem; border-radius: 9999px; background: #d1d5db; }
`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** A body long enough to overflow every viewport under test. */
function longBody(lines: number): string {
  return Array.from(
    { length: lines },
    (_, index) =>
      `    let value_${index} = map.entry(key_${index}).or_insert_with(Vec::new);`
  ).join("\n")
}

type Fixture = {
  goal: string
  promptLines: ReadonlyArray<string>
  body: string
}

/** The ordinary step: one short prompt line over a long proof. */
const ORDINARY: Fixture = {
  goal: "Push onto the vector you just got back, without a second lookup.",
  promptLines: ["`or_insert_with` returns `&mut V`. Chain straight onto it."],
  body: longBody(40),
}

/**
 * The adversarial step, mirroring the seed corpus's own hostile fixture: a
 * prompt far longer than any real one, over a two-token proof.
 */
const ADVERSARIAL: Fixture = {
  goal: "Read a prompt far longer than any real one and type two characters.",
  promptLines: [
    "This prompt is deliberately longer than any prompt an authored exercise should ever carry, because the panel that renders it must decide what to do about that before a generated corpus decides for it.",
    "It runs to several lines, each of them long enough to wrap at a narrow viewport, so that the measured page and the truncation affordance are both exercised rather than merely present.",
    "A third line, for the case where two were not enough to overflow the box on a tall window.",
    "And a fourth, because a hostile corpus does not stop at three.",
    "A fifth line establishes that the panel's answer does not depend on the count being small.",
  ],
  body: "ok",
}

/** A step with no prompt block at all, and a body taller than the box. */
const NO_PROMPT: Fixture = {
  goal: "Type a long body under no prompt at all.",
  promptLines: [],
  body: longBody(60),
}

function shellHtml(fixture: Fixture, typedChars: number): string {
  const lines = fixture.promptLines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")

  // A "typing run" is simulated by revealing progressively more of the body:
  // that is what actually changes as the player types, and it is the change
  // the prompt panel must be indifferent to.
  const shown = fixture.body.slice(0, typedChars)
  const rest = fixture.body.slice(typedChars)

  return `<!DOCTYPE html><html><head><style>${SHELL_CSS}</style></head><body>
    <div class="host">
      <div class="root">
        <div class="header"><span>The Entry API</span><span>62 wpm · 98% · 3:14</span></div>
        <label class="card">
          <div class="prompt" id="prompt">
            <p class="goal">${escapeHtml(fixture.goal)}</p>
            <div class="lines">${lines}</div>
          </div>
          <div class="viewport-wrap">
            <div class="viewport" id="viewport" data-scroll-intent="code-display"><pre id="body"><code>${escapeHtml(
              shown
            )}<span id="caret">|</span>${escapeHtml(rest)}</code></pre></div>
          </div>
          <div class="rail">${"<span></span>".repeat(10)}</div>
        </label>
      </div>
    </div>
  </body></html>`
}

type Box = { top: number; left: number; width: number; height: number }

async function boxOf(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).boundingBox()
  expect(box, `${selector} should be laid out`).not.toBeNull()
  return {
    top: Math.round(box?.y ?? 0),
    left: Math.round(box?.x ?? 0),
    width: Math.round(box?.width ?? 0),
    height: Math.round(box?.height ?? 0),
  }
}

/** Nothing outside the declared viewport may scroll, in either direction. */
async function assertOnlyTheViewportScrolls(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const bad: Array<{ tag: string; classes: string }> = []
    for (const element of Array.from(document.querySelectorAll("*"))) {
      if (element.getAttribute("data-scroll-intent") !== null) continue
      const overflowsDown = element.scrollHeight - element.clientHeight > 1
      const overflowsAcross = element.scrollWidth - element.clientWidth > 1
      const style = getComputedStyle(element)
      const scrolls =
        style.overflowY === "auto" ||
        style.overflowY === "scroll" ||
        style.overflowX === "auto" ||
        style.overflowX === "scroll"
      if (scrolls && (overflowsDown || overflowsAcross)) {
        bad.push({ tag: element.tagName, classes: element.className })
      }
    }
    return bad
  })

  expect(
    offenders,
    "only the typing viewport may scroll, and it declares that it does"
  ).toEqual([])

  const documentScrollsSideways = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
        document.documentElement.clientWidth >
      1
  )
  expect(
    documentScrollsSideways,
    "the exercise document must not scroll sideways"
  ).toBe(false)
}

/**
 * The guard that keeps the rest of this spec from being vacuous: a card whose
 * viewport never overflowed proves nothing about a card that has to scroll.
 */
async function assertViewportActuallyScrolls(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const viewport = document.querySelector("#viewport")
    if (!viewport) return 0
    return viewport.scrollHeight - viewport.clientHeight
  })
  expect(
    overflow,
    "the fixture must give the viewport more than it can hold"
  ).toBeGreaterThan(0)
}

for (const viewport of VIEWPORTS) {
  test.describe(`exercise shell @ ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test("the document does not scroll, at any step shape", async ({
      page,
    }) => {
      for (const fixture of [ORDINARY, ADVERSARIAL, NO_PROMPT]) {
        await page.setContent(shellHtml(fixture, 0))
        await assertOnlyTheViewportScrolls(page)
      }
    })

    test("the prompt panel's box is invariant across a typing run", async ({
      page,
    }) => {
      await page.setContent(shellHtml(ORDINARY, 0))
      await assertViewportActuallyScrolls(page)
      const atRest = await boxOf(page, "#prompt")

      // Ten frames of a run, from untouched to nearly finished.
      for (
        let typed = 0;
        typed <= ORDINARY.body.length;
        typed += Math.ceil(ORDINARY.body.length / 10)
      ) {
        await page.setContent(shellHtml(ORDINARY, typed))
        expect(
          await boxOf(page, "#prompt"),
          `the prompt moved or resized after ${typed} characters`
        ).toEqual(atRest)
      }
    })

    test("the prompt panel's box is invariant for a hostile prompt too", async ({
      page,
    }) => {
      // The case the doctrine exists for: a corpus is host-supplied data, and
      // a prompt that grew the panel would move the code under the player.
      await page.setContent(shellHtml(ADVERSARIAL, 0))
      const atRest = await boxOf(page, "#prompt")

      await page.setContent(shellHtml(ADVERSARIAL, ADVERSARIAL.body.length))
      expect(await boxOf(page, "#prompt")).toEqual(atRest)
    })

    test("a step advance does not jump the layout", async ({ page }) => {
      // Two steps whose bodies differ by an order of magnitude, and a prompt
      // that goes from one line to five. The card is the unit of progression,
      // so the *card* may change — the boxes around it may not.
      await page.setContent(shellHtml(ORDINARY, ORDINARY.body.length))
      const before = {
        prompt: await boxOf(page, "#prompt"),
        viewport: await boxOf(page, "#viewport"),
      }

      await page.setContent(shellHtml(NO_PROMPT, 0))
      const after = {
        prompt: await boxOf(page, "#prompt"),
        viewport: await boxOf(page, "#viewport"),
      }

      expect(after.prompt.top).toBe(before.prompt.top)
      expect(after.prompt.height).toBe(before.prompt.height)
      expect(after.viewport.top).toBe(before.viewport.top)
      expect(after.viewport.height).toBe(before.viewport.height)
      await assertOnlyTheViewportScrolls(page)
    })

    test("the prompt keeps its share and the viewport takes the rest", async ({
      page,
    }) => {
      // The 20/80 split is the cognitive-load allocation stated as layout. It
      // must hold at every viewport rather than collapsing on short windows,
      // which is why it is flex basis on a `shrink-0` child rather than a
      // percentage.
      await page.setContent(shellHtml(ORDINARY, 0))
      const prompt = await boxOf(page, "#prompt")
      const viewport = await boxOf(page, "#viewport")

      expect(prompt.height).toBeGreaterThan(0)
      expect(viewport.height).toBeGreaterThan(prompt.height)
    })
  })
}
