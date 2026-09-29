/**
 * @vitest-environment jsdom
 *
 * `__root.tsx`'s `beforeLoad` is the one gate every non-public route goes
 * through. Two things are asserted here that a route-tree-only test can't
 * see: which pathnames count as public (`/resume` was carved out so a
 * signed-out visitor can read it without hitting the passkey screen), and
 * that everything else still redirects while the server says there is no
 * session (`resolveSession`, mocked here).
 */

import { describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ signedIn: false, asked: 0 }))

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveSession: (): Promise<boolean> => {
    session.asked += 1
    return Promise.resolve(session.signedIn)
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

function callBeforeLoad(pathname: string): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see BeforeLoadUnderTest
  const beforeLoad = Route.options.beforeLoad as BeforeLoadUnderTest
  return Promise.resolve(beforeLoad({ location: { pathname, href: pathname } }))
}

const { Route } = await import("@/routes/__root")

describe("root beforeLoad: which routes require a session", () => {
  it("lets an unauthenticated visitor read /resume", async () => {
    await expect(callBeforeLoad("/resume")).resolves.toBeUndefined()
  })

  // The canonical, publicly-shared résumé URL (GitHub Pages'
  // /resume/index.html shell) carries a trailing slash the router's
  // basepath rewrite doesn't strip - see __root.tsx's beforeLoad comment.
  it("lets an unauthenticated visitor read /resume/ (trailing slash)", async () => {
    await expect(callBeforeLoad("/resume/")).resolves.toBeUndefined()
  })

  it("still redirects an unauthenticated visitor away from /app/ (trailing slash)", async () => {
    await expect(callBeforeLoad("/app/")).rejects.toBeDefined()
  })

  it("still redirects an unauthenticated visitor away from /app", async () => {
    await expect(callBeforeLoad("/app")).rejects.toBeDefined()
  })

  it("still redirects an unauthenticated visitor away from /sessions", async () => {
    await expect(callBeforeLoad("/sessions")).rejects.toBeDefined()
  })

  it("leaves / public", async () => {
    await expect(callBeforeLoad("/")).resolves.toBeUndefined()
  })

  it("leaves /auth public", async () => {
    await expect(callBeforeLoad("/auth")).resolves.toBeUndefined()
  })

  // Shared with people who have no account here, so the passkey screen would
  // defeat the point - and the trailing-slash form is what a pasted link or a
  // static-host rewrite can produce.
  it("lets an unauthenticated visitor read /extensions", async () => {
    await expect(callBeforeLoad("/extensions")).resolves.toBeUndefined()
  })

  it("lets an unauthenticated visitor read /extensions/ (trailing slash)", async () => {
    await expect(callBeforeLoad("/extensions/")).resolves.toBeUndefined()
  })
})

describe("root beforeLoad: asking the server", () => {
  it("lets a signed-in visitor through to a guarded route", async () => {
    session.signedIn = true
    try {
      await expect(callBeforeLoad("/app")).resolves.toBeUndefined()
    } finally {
      session.signedIn = false
    }
  })

  it("asks on a public route too, without waiting on the answer", async () => {
    const before = session.asked
    await expect(callBeforeLoad("/")).resolves.toBeUndefined()
    expect(session.asked).toBe(before + 1)
  })
})
