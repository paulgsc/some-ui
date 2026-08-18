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

afterEach(() => {
  document.getElementById(PREPAINT_VEIL_ID)?.remove()
  root.removeAttribute("data-transport-bootstrap")
  root.classList.remove("sw-dirty")
  vi.restoreAllMocks()
})

describe("createFilterBootstrap — install", () => {
  it("installs the Bootstrap sentinel and creates a self-tagged veil", () => {
    const fb = createFilterBootstrap(root)
    fb.install()

    expect(isInstalled(root)).toBe(true)

    const veil = document.getElementById(PREPAINT_VEIL_ID)
    expect(veil).not.toBeNull()
    if (veil === null) return
    expect(isSelfTagged(veil)).toBe(true)
  })

  it("is idempotent: a second call while already installed changes neither the sentinel nor the veil element", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000)
    const fb = createFilterBootstrap(root)
    fb.install()
    vi.restoreAllMocks()

    const firstInstalledAt = installedAt(root)
    const firstVeil = document.getElementById(PREPAINT_VEIL_ID)

    vi.spyOn(Date, "now").mockReturnValueOnce(2_000)
    fb.install()
    vi.restoreAllMocks()

    expect(installedAt(root)).toBe(firstInstalledAt)
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBe(firstVeil)
  })
})

describe("createFilterBootstrap — resetContent (Theorem D.1a: same-document navigation)", () => {
  it("advances the epoch on every navigation while the sentinel and veil are untouched", () => {
    const fb = createFilterBootstrap(root)
    fb.install()

    const installedAtValue = installedAt(root)
    const veil = document.getElementById(PREPAINT_VEIL_ID)
    const epochs: Array<number> = [fb.session.epoch]

    for (let i = 0; i < 3; i++) {
      fb.resetContent()
      epochs.push(fb.session.epoch)

      expect(isInstalled(root)).toBe(true)
      expect(installedAt(root)).toBe(installedAtValue)
      expect(document.getElementById(PREPAINT_VEIL_ID)).toBe(veil)
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
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000)
    const fb = createFilterBootstrap(root)
    fb.install()
    vi.restoreAllMocks()

    const originalInstalledAt = installedAt(root)
    const epochBeforeReset = fb.session.epoch

    fb.resetDocument()

    expect(isInstalled(root)).toBe(false)
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()

    vi.spyOn(Date, "now").mockReturnValueOnce(2_000)
    fb.install()
    vi.restoreAllMocks()

    expect(installedAt(root)).not.toBe(originalInstalledAt)
    expect(fb.session.epoch).toBeGreaterThan(epochBeforeReset)
    expect(document.getElementById(PREPAINT_VEIL_ID)).not.toBeNull()
  })

  it("runs every disposable before tearing down Bootstrap", () => {
    const fb = createFilterBootstrap(root)
    fb.install()

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
    const fb = createFilterBootstrap(root)
    fb.install()
    const veil = document.getElementById(PREPAINT_VEIL_ID)
    expect(veil).not.toBeNull()
    if (veil === null) return

    veil.remove() // simulated vendor sweep — no releaseOwnership() first

    expect(wasRemovedByVendor(veil)).toBe(true)
    expect(wasRemovedByUs(veil)).toBe(false)
  })

  it("reassertIfRemoved() re-creates the veil after a simulated vendor removal", () => {
    const fb = createFilterBootstrap(root)
    fb.install()
    const originalVeil = document.getElementById(PREPAINT_VEIL_ID)
    expect(originalVeil).not.toBeNull()
    if (originalVeil === null) return

    originalVeil.remove() // vendor sweep
    fb.reassertIfRemoved()

    const reassertedVeil = document.getElementById(PREPAINT_VEIL_ID)
    expect(reassertedVeil).not.toBeNull()
    expect(reassertedVeil).not.toBe(originalVeil)
  })

  it("reassertIfRemoved() is a no-op after our own resetDocument() teardown", () => {
    const fb = createFilterBootstrap(root)
    fb.install()
    fb.resetDocument()

    fb.reassertIfRemoved()

    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
    expect(isInstalled(root)).toBe(false)
  })

  it("reassertIfRemoved() is a no-op before the first install()", () => {
    const fb = createFilterBootstrap(root)
    expect(() => fb.reassertIfRemoved()).not.toThrow()
    expect(document.getElementById(PREPAINT_VEIL_ID)).toBeNull()
  })
})
