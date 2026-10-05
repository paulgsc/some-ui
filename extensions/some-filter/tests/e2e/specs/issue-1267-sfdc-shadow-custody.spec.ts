/**
 * The three G0.2 shadow-root creation traces Gate 0 used to falsify the
 * pre-fix pipeline, re-run against shadow-scope discovery and
 * `createOcclusionHold`: zero native-bright frames under the frame oracle.
 *
 * Each trace is a distinct ordering of "populate" vs. "connect" vs. "mutate"
 * (see `shadow-traces.ts`). Measured with `frames.ts`'s video-frame oracle:
 * Definition C.0 covers every render opportunity, and a discovery mechanism
 * racing the compositor is exactly what a polled screenshot cannot catch.
 *
 * Classification (#1360): already compliant (frame oracle).
 *
 * Traces 1 and 2 exercise the interval between a scope's creation and its
 * registration — Corollary D.3.1 permits it to be nonzero only because
 * discovery runs synchronously in a dedicated `MutationObserver` callback,
 * not the pipeline's 50ms-debounced coalescer (the shape G0.5 falsified).
 * Trace 3 exercises the reactive re-arm path: a mutation inside an
 * already-registered root.
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

test.describe("SF-DC — trace 1: shadow root populated before its disconnected host is inserted", () => {
  test("no frame ever shows the shadow-internal surface at native luminance after insertion", async ({
    gate0,
    context,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    await waitForClassification(page)

    const samples = await captureFrames(context, page, async () => {
      await traceDisconnectedThenInsert(page)
      await page.waitForTimeout(600)
    })

    expect(samples.length).toBeGreaterThan(0)
    const leak = firstLeak(samples, DARK)
    expect(
      leak,
      "expected zero native-bright frames — shadow-scope-discovery.ts's " +
        "dedicated, non-debounced MutationObserver should register and " +
        "occlude this root before the next paint, closing G0.2 trace 1"
    ).toBeUndefined()
  })
})

test.describe("SF-DC — trace 2: attachShadow() on an already-connected host, then synchronous population", () => {
  test("no frame ever shows the shadow-internal surface at native luminance after population", async ({
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
      "expected zero native-bright frames — the host's own insertion is " +
        "enough for shadow-scope-discovery.ts to react and find the " +
        "already-attached shadow root, closing G0.2 trace 2"
    ).toBeUndefined()
  })
})

test.describe("SF-DC — trace 3: mutation inside an already-connected, pre-existing open root", () => {
  test("mutating an existing shadow-internal surface's own background never shows at native luminance", async ({
    gate0,
    context,
  }) => {
    const page = await gate0.goto("shadow-surface-page")
    // Unlike traces 1-2, this root exists before classification: it is
    // discovered and held in the first auto pass, before the document's
    // veil lifts.
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
      "expected zero native-bright frames — this scope was already " +
        "registered and held before classification ever ran, so its " +
        "occlusion was never lifted for this mutation to expose anything " +
        "underneath, closing G0.2 trace 3"
    ).toBeUndefined()
  })
})
