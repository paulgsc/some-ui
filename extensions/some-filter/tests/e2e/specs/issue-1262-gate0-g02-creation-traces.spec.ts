/**
 * #1262 Gate 0, G0.2 — reproduce three distinct shadow-root creation traces
 * against the real built extension (`dist/content.js`), measured with a
 * frame oracle rather than a final-DOM-state check, per
 * docs/gate0/1262-falsification-report.md.
 *
 * The issue's own original fixture only ever proved a pre-existing, already
 * connected-and-populated open root. These three traces are the distinct
 * orderings the falsification spec names as independently required (a fix
 * proven against one is not evidence it holds for the others):
 *
 *   1. populate a *disconnected* host, then insert it.
 *   2. `attachShadow()` on an *already-connected* host, then populate.
 *   3. mutate an *existing* (already at-load) open root's own surface.
 *
 * A screenshot taken after a fixed wait cannot distinguish "never painted
 * natively" from "painted natively for one frame, then got covered before
 * the poll landed" — Definition C.0's zero-leak invariant is about every
 * render opportunity, not the one a poll happened to catch. `frames.ts`'s
 * `captureFrames` decodes every frame ffmpeg extracts from a video recording
 * of the critical window, so this asserts over the whole window, not a
 * snapshot of its end.
 */

import { captureFrames, firstLeak } from "@filter/playwright/fixtures/frames"
import {
  expect,
  test,
  waitForClassification,
} from "@filter/playwright/fixtures/gate0-fixture"
import { DARK } from "@filter/playwright/fixtures/pixels"
import {
  traceAttachOnConnectedHost,
  traceDisconnectedThenInsert,
  traceMutateExistingSurface,
  traceMutationSetup,
} from "@filter/playwright/fixtures/shadow-traces"

test.describe("G0.2 — trace 1: shadow root populated before its disconnected host is inserted", () => {
  test("the shadow-internal white surface stays exposed at native luminance in every captured frame after insertion", async ({
    gate0,
    context,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)

    const samples = await captureFrames(context, page, async () => {
      await traceDisconnectedThenInsert(page)
      // Give the pipeline's reconcile window (50ms) and several render
      // opportunities past it a chance to react, if it were going to.
      await page.waitForTimeout(600)
    })

    expect(samples.length).toBeGreaterThan(0)
    const leak = firstLeak(samples, DARK)
    // This is the falsifiable claim: today's pipeline never discovers this
    // root at all (G0.1), so the surface is native-bright in every frame,
    // not just transiently. Documented here as the current, expected
    // (failing) state — see the Gate 0 report for the verdict this drives.
    expect(
      leak,
      "expected a native-bright frame — scan() never discovers a shadow root, so nothing ever themes this surface (G0.1); a passing/undefined result here would mean the pipeline has since changed and this spec must be revisited"
    ).toBeDefined()
  })
})

test.describe("G0.2 — trace 2: attachShadow() on an already-connected host, then synchronous population", () => {
  test("the shadow-internal white surface stays exposed at native luminance in every captured frame after population", async ({
    gate0,
    context,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)

    const samples = await captureFrames(context, page, async () => {
      await traceAttachOnConnectedHost(page)
      await page.waitForTimeout(600)
    })

    expect(samples.length).toBeGreaterThan(0)
    const leak = firstLeak(samples, DARK)
    expect(
      leak,
      "expected a native-bright frame for the same reason as trace 1 — the host's prior connection (with no shadow root yet) gives the observer nothing relevant to react to even if it fires"
    ).toBeDefined()
  })
})

test.describe("G0.2 — trace 3: mutation inside an already-connected, pre-existing open root, after the veil is gone", () => {
  test("mutating an existing shadow-internal surface's own background is never observed — it stays native-bright indefinitely, not just for one frame", async ({
    gate0,
    context,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    // Trace 3's root exists *before* classification, unlike traces 1-2 —
    // this isolates the observer gap (subtree:true never crosses a shadow
    // boundary, pipeline.ts:655) from the creation-timing gap.
    await traceMutationSetup(page)
    await waitForClassification(page)

    const samples = await captureFrames(context, page, async () => {
      await traceMutateExistingSurface(page)
      await page.waitForTimeout(600)
    })

    expect(samples.length).toBeGreaterThan(0)
    const leak = firstLeak(samples, DARK)
    expect(
      leak,
      "expected a native-bright frame — the document-level MutationObserver's subtree:true (pipeline.ts observe()) does not cross a shadow boundary by DOM spec, so this mutation produces zero tokens, ever"
    ).toBeDefined()
  })
})
