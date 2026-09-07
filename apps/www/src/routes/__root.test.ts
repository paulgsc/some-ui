/**
 * @vitest-environment jsdom
 *
 * `__root.tsx`'s `beforeLoad` is the one gate every non-public route goes
 * through. Two things are asserted here that a route-tree-only test can't
 * see: which pathnames count as public (`/resume` was carved out so a
 * signed-out visitor can read it without hitting the passkey screen), and
 * that everything else still redirects while there is no session.
 */

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth-session", () => ({
  hasDecorativeSession: (): boolean => false,
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

function callBeforeLoad(pathname: string): () => unknown {
  return () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see BeforeLoadUnderTest
    const beforeLoad = Route.options.beforeLoad as BeforeLoadUnderTest
    return beforeLoad({ location: { pathname, href: pathname } })
  }
}

const { Route } = await import("./__root")

describe("root beforeLoad: which routes require a session", () => {
  it("lets an unauthenticated visitor read /resume", () => {
    expect(callBeforeLoad("/resume")).not.toThrow()
  })

  // The canonical, publicly-shared résumé URL (GitHub Pages'
  // /resume/index.html shell) carries a trailing slash the router's
  // basepath rewrite doesn't strip - see __root.tsx's beforeLoad comment.
  it("lets an unauthenticated visitor read /resume/ (trailing slash)", () => {
    expect(callBeforeLoad("/resume/")).not.toThrow()
  })

  it("still redirects an unauthenticated visitor away from /app/ (trailing slash)", () => {
    expect(callBeforeLoad("/app/")).toThrow()
  })

  it("still redirects an unauthenticated visitor away from /app", () => {
    expect(callBeforeLoad("/app")).toThrow()
  })

  it("still redirects an unauthenticated visitor away from /sessions", () => {
    expect(callBeforeLoad("/sessions")).toThrow()
  })

  it("leaves / public", () => {
    expect(callBeforeLoad("/")).not.toThrow()
  })

  it("leaves /auth public", () => {
    expect(callBeforeLoad("/auth")).not.toThrow()
  })
})
