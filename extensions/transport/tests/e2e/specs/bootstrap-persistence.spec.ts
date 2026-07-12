import { expect, test, type Page } from "@playwright/test"

import { churn, hostilePageHtml } from "../fixtures/hostile-page"

const HARNESS_BUNDLE = "tests/e2e/harness/dist/entry.js"

test.describe("Bootstrap persistence (Theorem D.1) and day-zero pessimism (Corollary D.1.1)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent(hostilePageHtml())
    await page.addScriptTag({ path: HARNESS_BUNDLE })
  })

  test("sentinel is present the moment the bundle executes — before any content session exists", async ({
    page,
  }) => {
    const installed = await page.evaluate(() =>
      window.__transport.isBootstrapInstalled()
    )
    expect(installed).toBe(true)
  })

  const churnSteps: ReadonlyArray<{
    readonly name: string
    readonly run: (page: Page) => Promise<void>
  }> = [
    { name: "blank", run: churn.blank },
    { name: "themeFlip", run: churn.themeFlip },
    { name: "bodyHeadReplace", run: churn.bodyHeadReplace },
    { name: "styleChurn", run: churn.styleChurn },
    { name: "spaNavigate", run: churn.spaNavigate },
    {
      name: "virtualizedRecycle",
      run: (page) => churn.virtualizedRecycle(page, "#content-root", "k1", 1),
    },
    // No actuator output has been produced yet in this test, so removing
    // anything matching this selector is harmless by construction — the
    // point is that Bootstrap survives regardless.
    {
      name: "extensionDomRemoval",
      run: (page) => churn.extensionDomRemoval(page, "[data-nonexistent]"),
    },
  ]

  for (const { name, run } of churnSteps) {
    test(`Bootstrap survives churn step: ${name}`, async ({ page }) => {
      const before = await page.evaluate(() =>
        window.__transport.bootstrapInstalledAt()
      )

      await run(page)

      const installed = await page.evaluate(() =>
        window.__transport.isBootstrapInstalled()
      )
      const after = await page.evaluate(() =>
        window.__transport.bootstrapInstalledAt()
      )

      expect(installed).toBe(true)
      expect(after).toBe(before)
    })
  }

  test("root replacement: sentinel survives because Bootstrap re-reads document.documentElement, which itself is never replaced", async ({
    page,
  }) => {
    const before = await page.evaluate(() =>
      window.__transport.bootstrapInstalledAt()
    )
    await churn.rootReplace(page)
    const installed = await page.evaluate(() =>
      window.__transport.isBootstrapInstalled()
    )
    const after = await page.evaluate(() =>
      window.__transport.bootstrapInstalledAt()
    )

    expect(installed).toBe(true)
    expect(after).toBe(before)
  })
})

test.describe("Theorem D.1(a): same-document (SPA) navigation", () => {
  test("content session is recreated, Bootstrap is untouched, epoch advances with no gap in custody", async ({
    page,
  }) => {
    await page.setContent(hostilePageHtml())
    await page.addScriptTag({ path: HARNESS_BUNDLE })

    const before = await page.evaluate(() => ({
      bootstrapAt: window.__transport.bootstrapInstalledAt(),
      epoch: window.__transport.getEpoch(),
    }))

    await churn.spaNavigate(page)
    await page.evaluate(() => window.__transport.teardownContentSession())
    // "new content init" — the SPA-nav path never reinstalls Bootstrap.
    await page.evaluate(
      (selector) => window.__transport.startSensing(selector),
      "#content-root"
    )

    const after = await page.evaluate(() => ({
      bootstrapAt: window.__transport.bootstrapInstalledAt(),
      installed: window.__transport.isBootstrapInstalled(),
      epoch: window.__transport.getEpoch(),
    }))

    expect(after.installed).toBe(true)
    expect(after.bootstrapAt).toBe(before.bootstrapAt)
    expect(after.epoch).toBeGreaterThan(before.epoch)
  })
})

test.describe("Theorem D.1(b): refresh", () => {
  test("both Bootstrap and the content session are recreated", async ({
    page,
  }) => {
    await page.setContent(hostilePageHtml())
    await page.addScriptTag({ path: HARNESS_BUNDLE })

    const before = await page.evaluate(() => ({
      bootstrapAt: window.__transport.bootstrapInstalledAt(),
      epoch: window.__transport.getEpoch(),
    }))

    await page.evaluate(() => window.__transport.teardownDocumentSession())
    // "Bootstrap reinstall" + "new content init" — the refresh path.
    await page.evaluate(() => window.__transport.installBootstrap())
    await page.evaluate(
      (selector) => window.__transport.startSensing(selector),
      "#content-root"
    )

    const after = await page.evaluate(() => ({
      bootstrapAt: window.__transport.bootstrapInstalledAt(),
      epoch: window.__transport.getEpoch(),
    }))

    expect(after.bootstrapAt).not.toBe(before.bootstrapAt)
    expect(after.epoch).toBeGreaterThan(before.epoch)
  })
})
