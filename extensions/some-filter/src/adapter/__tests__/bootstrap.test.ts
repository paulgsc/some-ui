import {
  createFilterBootstrap,
  wasRemovedByUs,
  wasRemovedByVendor,
} from "@filter/adapter/bootstrap"
import { PREPAINT_VEIL_ID } from "@filter/lib/content/prepaint"
import { isSelfTagged } from "@some-extension/transport/actuator/self-tag"
import {
  installedAt,
  isInstalled,
} from "@some-extension/transport/bootstrap/static"
import { afterEach, describe, expect, it, vi } from "vitest"

const root = document.documentElement

const veil = (): HTMLElement | null => document.getElementById(PREPAINT_VEIL_ID)

function installed(): ReturnType<typeof createFilterBootstrap> {
  const fb = createFilterBootstrap(root)
  fb.install()
  return fb
}

/** Runs `fn` with the next `Date.now()` returning `ms`. */
function atTime(ms: number, fn: () => void): void {
  vi.spyOn(Date, "now").mockReturnValueOnce(ms)
  fn()
  vi.restoreAllMocks()
}

afterEach(() => {
  document.getElementById(PREPAINT_VEIL_ID)?.remove()
  root.removeAttribute("data-transport-bootstrap")
  root.classList.remove("sw-dirty")
  vi.restoreAllMocks()
})

describe("createFilterBootstrap — install", () => {
  it("installs the Bootstrap sentinel and creates a self-tagged veil", () => {
    installed()

    expect(isInstalled(root)).toBe(true)

    const el = veil()
    expect(el).not.toBeNull()
    if (el === null) return
    expect(isSelfTagged(el)).toBe(true)
  })

  it("is idempotent: a second call while already installed changes neither the sentinel nor the veil element", () => {
    const fb = createFilterBootstrap(root)
    atTime(1_000, () => fb.install())

    const firstInstalledAt = installedAt(root)
    const firstVeil = veil()

    atTime(2_000, () => fb.install())

    expect(installedAt(root)).toBe(firstInstalledAt)
    expect(veil()).toBe(firstVeil)
  })
})

describe("createFilterBootstrap — resetContent (Theorem D.1a: same-document navigation)", () => {
  it("advances the epoch on every navigation while the sentinel and veil are untouched", () => {
    const fb = installed()

    const installedAtValue = installedAt(root)
    const veilBefore = veil()
    const epochs: Array<number> = [fb.session.epoch]

    for (let i = 0; i < 3; i++) {
      fb.resetContent()
      epochs.push(fb.session.epoch)

      expect(isInstalled(root)).toBe(true)
      expect(installedAt(root)).toBe(installedAtValue)
      expect(veil()).toBe(veilBefore)
    }

    const [first, ...rest] = epochs
    expect(first).toBeDefined()
    let previous = first ?? -Infinity
    for (const epoch of rest) {
      expect(epoch).toBeGreaterThan(previous)
      previous = epoch
    }
  })
})

describe("createFilterBootstrap — resetDocument (Theorem D.1b: refresh)", () => {
  it("tears down the sentinel and veil; a subsequent install() reinstalls fresh with a strictly greater epoch", () => {
    const fb = createFilterBootstrap(root)
    atTime(1_000, () => fb.install())

    const originalInstalledAt = installedAt(root)
    const epochBeforeReset = fb.session.epoch

    fb.resetDocument()

    expect(isInstalled(root)).toBe(false)
    expect(veil()).toBeNull()

    atTime(2_000, () => fb.install())

    expect(installedAt(root)).not.toBe(originalInstalledAt)
    expect(fb.session.epoch).toBeGreaterThan(epochBeforeReset)
    expect(veil()).not.toBeNull()
  })

  it("runs every disposable before tearing down Bootstrap", () => {
    const fb = installed()

    const calls: Array<string> = []
    fb.resetDocument([
      (): void => {
        calls.push("a")
      },
      (): void => {
        calls.push("b")
      },
    ])

    expect(calls).toEqual(["a", "b"])
    expect(isInstalled(root)).toBe(false)
  })
})

describe("createFilterBootstrap — ownership signal (Remark 7.2)", () => {
  it("distinguishes a vendor removal from our own teardown at the element level", () => {
    installed()
    const el = veil()
    expect(el).not.toBeNull()
    if (el === null) return

    el.remove() // simulated vendor sweep — no releaseOwnership() first

    expect(wasRemovedByVendor(el)).toBe(true)
    expect(wasRemovedByUs(el)).toBe(false)
  })

  it("reassertIfRemoved() re-creates the veil after a simulated vendor removal", () => {
    const fb = installed()
    const originalVeil = veil()
    expect(originalVeil).not.toBeNull()
    if (originalVeil === null) return

    originalVeil.remove() // vendor sweep
    fb.reassertIfRemoved()

    const reassertedVeil = veil()
    expect(reassertedVeil).not.toBeNull()
    expect(reassertedVeil).not.toBe(originalVeil)
  })

  it("reassertIfRemoved() is a no-op after our own resetDocument() teardown", () => {
    const fb = installed()
    fb.resetDocument()

    fb.reassertIfRemoved()

    expect(veil()).toBeNull()
    expect(isInstalled(root)).toBe(false)
  })

  it("reassertIfRemoved() is a no-op before the first install()", () => {
    const fb = createFilterBootstrap(root)
    expect(() => fb.reassertIfRemoved()).not.toThrow()
    expect(veil()).toBeNull()
  })
})
