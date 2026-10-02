/**
 * @vitest-environment jsdom
 *
 * Two route guards, one idea. The dashboard layout waits (once) until the
 * learner's data authority is decided, so no page renders against the wrong
 * store while a returning account user's session is checked; anyone learning
 * on the device does not wait at all. The LAN layout, which is the account's
 * own, then needs only a synchronous look: not on the account, to the passkey
 * screen with this address to come back to.
 */

import { beforeEach, describe, expect, it } from "vitest"

import { authority } from "@/lib/authority"

type BeforeLoadUnderTest = (args: {
  location: { pathname: string; href: string }
}) => unknown

const { Route: dashboard } = await import("@/routes/_dashboard")
const { Route: lan } = await import("@/routes/_dashboard/_lan")

function beforeLoad(
  route: { options: { beforeLoad?: unknown } },
  href: string
): unknown {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the guards read only `location`, as `__root.test.ts` does
  const run = route.options.beforeLoad as BeforeLoadUnderTest
  return run({ location: { pathname: href, href } })
}

beforeEach(() => {
  window.localStorage.clear()
  authority.resetForTests()
})

describe("the dashboard layout waits for a decided authority", () => {
  it("does not wait for someone learning on the device", async () => {
    await expect(beforeLoad(dashboard, "/sessions")).resolves.toBeUndefined()
  })

  it("holds a returning account user until their session has been checked", async () => {
    window.localStorage.setItem(
      "some-ui.authority.v1",
      JSON.stringify({ choice: "account" })
    )
    authority.resetForTests()

    let released = false
    const waiting = Promise.resolve(beforeLoad(dashboard, "/sessions")).then(
      () => {
        released = true
      }
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(released).toBe(false)

    authority.dispatch({ type: "session-learned", session: "signed-in" })
    await waiting
    expect(released).toBe(true)
  })
})

describe("the LAN layout is the account's own", () => {
  it("lets the account through", () => {
    authority.dispatch({ type: "session-started", adopt: true })
    expect(beforeLoad(lan, "/lessons")).toBeUndefined()
  })

  it("sends someone learning on the device to the passkey screen, remembering where they were going", () => {
    expect(() => beforeLoad(lan, "/lessons?x=1")).toThrowError(
      expect.objectContaining({
        options: expect.objectContaining({
          to: "/auth",
          search: { redirect: "/lessons?x=1" },
        }),
      })
    )
  })

  it("sends someone whose session was lost to the passkey screen too", () => {
    authority.dispatch({ type: "session-started", adopt: true })
    authority.dispatch({ type: "session-ended", forget: false })
    expect(() => beforeLoad(lan, "/rounds")).toThrow()
  })
})
