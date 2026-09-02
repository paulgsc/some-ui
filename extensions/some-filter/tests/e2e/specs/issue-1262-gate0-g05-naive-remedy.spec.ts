/**
 * #1262 Gate 0, G0.5 — falsify the naive issue remedy.
 *
 * docs/gate0/1262-falsification-report.md's G0.5: implement, in the harness
 * only (never production `pipeline.ts` — see `naive-remedy.ts`'s header),
 * exactly what the issue itself proposes — a recursive shadow-aware scan, a
 * `MutationObserver` per discovered root, a per-root theme injection — while
 * retaining the real 50ms reconcile debounce (`RECONCILE_POLICY.debounceMs`,
 * pipeline.ts:60). Then demonstrate whether a dynamically inserted bright
 * surface still paints natively during the debounce interval. If it does,
 * this is the decisive counterexample: reachability (finding every root,
 * eventually) is not admission control (never letting a native-bright frame
 * paint) — G0.1/G0.2 show the *current* pipeline fails by never finding the
 * root at all; this spec shows that merely fixing discovery, without a
 * synchronous hold, does not close the gap G0.0's optimization bias exists
 * to close, it only shortens it.
 *
 * The burst (`sustainedShadowChurn`) also settles G0.3's core timing claim on
 * this environment's one available browser (Chromium — see fixture.ts's own
 * header: Playwright has no supported unsigned-extension path for Firefox,
 * so that leg of G0.3 cannot be run here; the report records this as an
 * explicit limitation, not a silent gap): under sustained churn, each new
 * mutation re-arms the debounce before the previous one fires, so a raw
 * mutation notification reaching a registered observer is demonstrably not
 * "synchronously before next paint" — there is a real, measured, paintable
 * gap between mutation and any reactive re-theming.
 */

import { captureFrames, firstLeak } from "@filter/playwright/fixtures/frames"
import {
  expect,
  test,
  waitForClassification,
} from "@filter/playwright/fixtures/gate0-fixture"
import {
  installNaiveRemedy,
  sustainedShadowChurn,
} from "@filter/playwright/fixtures/naive-remedy"
import { DARK } from "@filter/playwright/fixtures/pixels"

const BURST_MS = 300
const SETTLE_TAIL_MS = 500

test.describe("G0.5 — the naive remedy (recursive scan + per-root observer + per-root style, 50ms coalescer retained)", () => {
  test("a sustained burst of newly created shadow surfaces stays native-bright throughout the burst, then recovers once churn stops and the debounce finally fires", async ({
    gate0,
    context,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)
    await installNaiveRemedy(page)

    const samples = await captureFrames(context, page, async () => {
      await sustainedShadowChurn(page, BURST_MS)
      // Past the burst, well past one settled debounce round, so the tail
      // of this capture proves recovery, not just the counterexample.
      await page.waitForTimeout(SETTLE_TAIL_MS)
    })

    expect(samples.length).toBeGreaterThan(0)

    // The decisive counterexample: at least one frame, while the burst is
    // (re-)arming the coalescer's 50ms debounce on every tick, is native-bright
    // — the naive remedy's own coalescing is an explicit native-visibility
    // budget, not a hold. Preserved here, and in the report, as the trace
    // this spec exists to produce.
    const leak = firstLeak(samples, DARK)
    expect(
      leak,
      "expected at least one native-bright frame during the churn burst — " +
        "if this is ever undefined, the naive remedy's debounce is somehow " +
        "not exposing the gap G0.5 predicts and the counterexample needs " +
        "re-examination, not deletion of this assertion"
    ).toBeDefined()

    // Recovery: the *last* captured frame, well after the burst stopped and
    // several debounce rounds have had time to settle, must NOT be a leak —
    // this is what distinguishes "reachability with a timing gap" (the
    // proposition under test) from "the harness's own naive-remedy
    // simulation is simply broken and never themes anything."
    const lastFrame = samples[samples.length - 1]
    expect(lastFrame).toBeDefined()
    if (lastFrame === undefined) return
    expect(
      lastFrame.brightest.luminance,
      "expected the naive remedy to have caught up by the end of the " +
        "settle tail — if it hasn't, the harness simulation itself needs " +
        "fixing before this counterexample can be trusted"
    ).toBeLessThanOrEqual(DARK)
  })
})
