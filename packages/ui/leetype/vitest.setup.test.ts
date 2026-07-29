import { describe, expect, it } from "vitest"

import { ensureUsableWebStorage } from "./vitest.setup"

// Regression coverage for the CI-only "localStorage.clear is not a
// function" failure: on a Node that installs its own inert Web Storage
// globals, every test file with a `localStorage.clear()` in `beforeEach`
// dies before its first assertion. Local Node 22 has no such global, so the
// repair can't be observed by running the suite here — these tests simulate
// the shadowed global directly so the behavior is pinned on any Node.

/** A stand-in for what Node leaves on `globalThis`: present, but not a `Storage`. */
function shadowedGlobal(): typeof globalThis {
  const target = { localStorage: { length: 0 }, sessionStorage: { length: 0 } }
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- a minimal stand-in for the global object under test
  return target as unknown as typeof globalThis
}

describe("ensureUsableWebStorage", () => {
  it("replaces a global that exists but has no Storage methods", () => {
    const target = shadowedGlobal()

    ensureUsableWebStorage(target)

    expect(typeof target.localStorage.clear).toBe("function")
    expect(typeof target.sessionStorage.clear).toBe("function")
  })

  it("installs a store that round-trips values", () => {
    const target = shadowedGlobal()
    ensureUsableWebStorage(target)

    target.localStorage.setItem("leetyping_progress", "{}")
    expect(target.localStorage.getItem("leetyping_progress")).toBe("{}")
    expect(target.localStorage.length).toBe(1)
    expect(target.localStorage.key(0)).toBe("leetyping_progress")

    target.localStorage.removeItem("leetyping_progress")
    expect(target.localStorage.getItem("leetyping_progress")).toBeNull()
    expect(target.localStorage.length).toBe(0)
  })

  it("clears every key at once", () => {
    const target = shadowedGlobal()
    ensureUsableWebStorage(target)

    target.localStorage.setItem("a", "1")
    target.localStorage.setItem("b", "2")
    target.localStorage.clear()

    expect(target.localStorage.length).toBe(0)
    expect(target.localStorage.getItem("a")).toBeNull()
  })

  it("returns null for a missing key rather than undefined", () => {
    const target = shadowedGlobal()
    ensureUsableWebStorage(target)

    expect(target.localStorage.getItem("nope")).toBeNull()
    expect(target.localStorage.key(9)).toBeNull()
  })

  it("leaves a usable storage alone", () => {
    const target = shadowedGlobal()
    ensureUsableWebStorage(target)
    const installed = target.localStorage

    ensureUsableWebStorage(target)

    expect(target.localStorage).toBe(installed)
  })

  it("has already repaired the ambient global this suite runs under", () => {
    // Whichever Node this is, the setup file ran first — so the storage the
    // rest of the package's tests reach for is usable.
    expect(typeof localStorage.clear).toBe("function")
    expect(globalThis.localStorage).toBe(localStorage)
  })
})
