/**
 * SF-DC (#1267) — the same three G0.2 shadow-root creation traces Gate 0
 * used to falsify the pre-fix pipeline, re-run against the real implementation
 * (`shadow-scope-discovery.ts` + `custody-primitive.ts`'s `createOcclusionHold`,
 * wired into `content.ts`), proving the counterexample G0.5 found is now
 * closed rather than merely narrowed. See #1267's own acceptance criteria:
 * "All three of Gate 0's G0.2 creation traces... show zero native-bright
 * frames with the frame oracle."
 *
 * Each trace is a distinct ordering of "populate" vs. "connect" vs. "mutate"
 * (`shadow-traces.ts`'s own header has the full rationale for why all three
 * are independently required). Measured with `frames.ts`'s real video-frame
 * oracle, not a post-hoc screenshot poll — Definition C.0's zero-leak
 * invariant is a claim about every render opportunity, and a discovery
 * mechanism racing the compositor is exactly the class of bug a polled
 * screenshot cannot catch (this is the same reason the pre-fix G0.2 specs on
 * `claude/new-session-vmw51h` needed a frame oracle to demonstrate the leak
 * in the first place).
 *
 * Traces 1 and 2 exercise the interval between a scope's *creation* (light-
 * DOM insertion, in the real DOM's actual event order) and its *registration*
 * — Corollary D.3.1 permits that interval to be nonzero, but only because
 * this story's discovery runs synchronously inside a dedicated
 * `MutationObserver`'s microtask callback, decoupled from `pipeline.ts`'s
 * own 50ms-debounced coalescer (the shape G0.5 already falsified). Trace 3
 * exercises the *reactive re-arm* path — a mutation inside an
 * already-registered root — which stays covered for a simpler reason in
 * this story specifically: nothing here ever resolves a shadow scope past
 * `HELD`, so its occlusion never lifts in the first place (see
 * `shadow-scope-discovery.ts`'s own header for why, and for the real
 * production trade-off that follows from it).
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
    // This root exists before classification, unlike traces 1-2 — it is
    // discovered and held during the very first auto-mode pass, before the
    // document's own veil ever lifts (this module's own header explains why
    // that ordering makes trace 3 hold trivially in this story: the scope
    // never leaves HELD, so there is no later mutation that could expose it).
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
