/**
 * @vitest-environment jsdom
 *
 * `__root.tsx`'s `beforeLoad` is the gate every route goes through. Learning on
 * the device needs no session, so what is asserted here is that the gate lets
 * every page open for a visitor with none, and that it makes the one check it
 * does make (`resolveSessionIfChosen`, mocked here) without waiting on it: a
 * page must never be held up on a server round trip, and a visitor who never
 * chose an account is never asked about one (see `session.test.ts`).
 *
 * The pages that really are the account's are guarded by `requireAccount` in
 * their own layout (`routes/_dashboard/_lan.tsx`); `guards.test.ts` covers it.
 */

import { describe, expect, it, vi } from "vitest"

const checks = vi.hoisted(() => ({ asked: 0 }))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveSessionIfChosen: (): Promise<boolean> => {
    checks.asked += 1
    // Never settles: the gate must not wait on it.
    return new Promise<boolean>(() => undefined)
  },
}))

/**
 * `Route.options.beforeLoad` is typed against the router's full context
 * (params, navigate, cause, ...); the guard reads only `location.pathname`,
 * so that is the narrowest shape worth asserting against here - mirrors
 * `loaders.test.ts`'s `LoaderUnderTest` pattern for the same reason.
 */
type BeforeLoadUnderTest = (args: {
  location: { pathname: string; href: string }
}) => unknown

function callBeforeLoad(pathname: string): unknown {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see BeforeLoadUnderTest
  const beforeLoad = Route.options.beforeLoad as BeforeLoadUnderTest
  return beforeLoad({ location: { pathname, href: pathname } })
}

const { Route } = await import("@/routes/__root")

describe("root beforeLoad: no page needs a session", () => {
  it.each([
    "/",
    "/auth",
    "/resume",
    "/resume/",
    "/extensions",
    "/extensions/",
    "/app",
    "/app/",
    "/sessions",
    "/sessions/new",
    "/settings",
    "/profile",
  ])("lets a visitor with no session open %s", (pathname) => {
    expect(callBeforeLoad(pathname)).toBeUndefined()
  })

  it("is not held up by the session check it starts", () => {
    const before = checks.asked
    // Returns at once, synchronously, although the check it started never settles.
    expect(callBeforeLoad("/sessions")).toBeUndefined()
    expect(checks.asked).toBe(before + 1)
  })
})
