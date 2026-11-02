/**
 * The front desk's own page (`/settings`): the desktop web lists its cards;
 * the phone has no list, since its bar of pages is the way between them, so
 * it opens on the bar's first page (MY-DATA MD1, paulgsc/some-ui#2475).
 */

import { isRedirect } from "@tanstack/react-router"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as BuildProfileModule from "@/lib/build-profile"

let carriesApk = true

vi.mock(
  "@/lib/build-profile",
  async (importOriginal): Promise<typeof BuildProfileModule> => ({
    ...(await importOriginal<typeof BuildProfileModule>()),
    hasAudience: (audience) => audience === "apk" && carriesApk,
  })
)

const { Route } = await import("@/routes/_dashboard/settings/index")

/** What the desk's `beforeLoad` throws, or undefined when it lets the page open. */
function arrive(): unknown {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the guard reads nothing it is passed
  const run = Route.options.beforeLoad as () => void
  try {
    run()
    return undefined
  } catch (thrown) {
    return thrown
  }
}

afterEach(() => {
  carriesApk = true
})

describe("arriving at Settings", () => {
  it("opens the phone on its bar's first page, in place of the desk", () => {
    const thrown = arrive()

    expect(isRedirect(thrown)).toBe(true)
    expect(thrown).toMatchObject({
      options: { to: "/settings/status", replace: true },
    })
  })

  it("opens the desk's cards in a build without the phone's pages", () => {
    carriesApk = false

    expect(arrive()).toBeUndefined()
  })
})
