/**
 * @vitest-environment jsdom
 *
 * `__root.tsx`'s `beforeLoad` lets every page open for a visitor with no
 * session, and makes its one check (`resolveSessionIfChosen`, mocked)
 * without waiting on it. Account-only pages are guarded by `requireAccount`
 * in their own layout (`guards.test.ts`).
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

/** The narrowest shape the guard reads (`location.pathname`), as in
 * `loaders.test.ts`. */
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
