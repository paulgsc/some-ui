import { describe, expect, it, vi } from "vitest"

import {
  install,
  installedAt,
  isInstalled,
  uninstall,
} from "../bootstrap/static"
import { createSessionLifecycle } from "../session/lifecycle"
import { teardownContent, teardownDocument } from "./teardown"

function freshRoot(): Element {
  return document.implementation.createHTMLDocument("").documentElement
}

describe("lifecycle — Theorem D.1(a): same-document navigation", () => {
  it("Bootstrap's sentinel is the same installed instance across N consecutive SPA navigations; only epoch changes", () => {
    const root = freshRoot()
    vi.spyOn(Date, "now").mockReturnValue(1_000)
    const bootstrap = install(root)
    vi.restoreAllMocks()

    const session = createSessionLifecycle()
    const epochs: Array<number> = [session.epoch]

    for (let i = 0; i < 5; i++) {
      teardownContent([], session)
      epochs.push(session.epoch)

      // "new content init" — the SPA-nav path never reinstalls Bootstrap.
      expect(installedAt(root)).toBe(bootstrap.installedAt)
      expect(isInstalled(root)).toBe(true)
    }

    // The epoch strictly advanced on every navigation.
    let previous = epochs[0]
    for (const epoch of epochs.slice(1)) {
      expect(previous).toBeDefined()
      expect(epoch).toBeGreaterThan(previous ?? -Infinity)
      previous = epoch
    }
  })
})

describe("lifecycle — Theorem D.1(b): refresh", () => {
  it("Bootstrap's sentinel is a new installation and the epoch resets alongside it", () => {
    const root = freshRoot()
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000)
    const originalInstall = install(root)
    vi.restoreAllMocks()

    const session = createSessionLifecycle()
    teardownContent([], session) // some content-only activity before the refresh
    const epochBeforeRefresh = session.epoch

    vi.spyOn(Date, "now").mockReturnValueOnce(2_000)
    teardownDocument([], session, () => uninstall(root))
    const reinstalled = install(root) // "Bootstrap reinstall" + "new content init" per the refresh path
    vi.restoreAllMocks()

    expect(reinstalled.installedAt).not.toBe(originalInstall.installedAt)
    expect(session.epoch).toBeGreaterThan(epochBeforeRefresh)
  })
})
