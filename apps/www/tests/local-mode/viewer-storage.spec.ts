/**
 * VS1 (#3121, `build.treeshake.ts`): on the built Pages app, a viewer's
 * storage is the in-memory copy `lib/demo/viewer-storage` puts in place, so
 * what a viewer writes is gone after a reload (CLAUDE.md, "A viewer tries,
 * and nothing is kept"). Observed on the bundle, not the source: the release
 * build's tree shaking dropped the module once, and no unit test could see
 * that.
 *
 * The control: the same write on a page that is not the app does survive a
 * reload in this browser, so "gone" means the copy, not the harness.
 */

import { expect, test } from "@playwright/test"

import { builtApp, serveBuild } from "./harness"
import type { Listening } from "./harness"

const BASE = "/some-ui/"
const KEY = "vs1-probe"

test.describe("the Pages app keeps nothing a viewer writes", () => {
  let site: Listening | null = null
  test.beforeAll(async () => {
    const built = builtApp("pages")
    if ("why" in built) {
      // CI must not pass by measuring nothing; a laptop may lack the build.
      if (process.env["CI"]) throw new Error(built.why)
      test.skip(true, built.why)
      return
    }
    site = await serveBuild(built.dir, BASE)
  })
  test.afterAll(async () => {
    await site?.close()
  })

  test("a reload starts over, and the storage is not the browser's", async ({
    page,
  }) => {
    const app = `${site!.origin}${BASE}`

    // Control: a plain file from the same origin, outside the app's code,
    // where the browser's own storage holds a write across a reload.
    await page.goto(`${app}favicon.ico`)
    await page.evaluate((key) => {
      localStorage.setItem(key, "kept")
    }, KEY)
    await page.reload()
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(
      "kept"
    )

    await page.goto(app)
    await expect(page.locator("main").first()).toBeAttached()
    const storage = await page.evaluate(
      (key) => ({
        real: window.localStorage instanceof Storage,
        session: window.sessionStorage instanceof Storage,
        seen: localStorage.getItem(key),
      }),
      KEY
    )
    expect(storage).toEqual({ real: false, session: false, seen: null })

    await page.evaluate((key) => {
      localStorage.setItem(key, "written by a viewer")
      sessionStorage.setItem(key, "written by a viewer")
    }, KEY)
    await page.reload()
    await expect(page.locator("main").first()).toBeAttached()
    expect(
      await page.evaluate(
        (key) => [localStorage.getItem(key), sessionStorage.getItem(key)],
        KEY
      )
    ).toEqual([null, null])
  })
})
