import { describe, expect, it, vi } from "vitest"

import { install, installedAt, isInstalled, uninstall } from "./static"

function freshRoot(): Element {
  return document.implementation.createHTMLDocument("").documentElement
}

describe("bootstrap/static", () => {
  it("is not installed until install() runs", () => {
    const root = freshRoot()
    expect(isInstalled(root)).toBe(false)
    expect(installedAt(root)).toBeUndefined()
  })

  it("installs a sentinel carrying the installation epoch", () => {
    const root = freshRoot()
    const now = 1_720_000_000_000
    vi.spyOn(Date, "now").mockReturnValue(now)

    const layer = install(root)

    expect(isInstalled(root)).toBe(true)
    expect(layer.root).toBe(root)
    expect(layer.installedAt).toBe(now)
    expect(installedAt(root)).toBe(now)

    vi.restoreAllMocks()
  })

  it("is idempotent: a second install() within the same L_D is a no-op", () => {
    const root = freshRoot()
    vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(2)

    const first = install(root)
    const second = install(root)

    expect(second.installedAt).toBe(first.installedAt)
    expect(second.root).toBe(first.root)

    vi.restoreAllMocks()
  })

  it("survives arbitrary DOM mutation of everything except the sentinel", () => {
    const root = freshRoot()
    const layer = install(root)

    // Simulate a same-document (SPA) navigation: the router tears down and
    // rebuilds the entire body subtree, but never touches root's attributes.
    root.innerHTML = "<body><main>first route</main></body>"
    root.innerHTML = "<body><main>second route</main></body>"
    root.removeChild(root.firstElementChild!)

    expect(isInstalled(root)).toBe(true)
    expect(installedAt(root)).toBe(layer.installedAt)
  })

  it("treats a fresh document's root as not yet installed (refresh begins a new L_D)", () => {
    const originalRoot = freshRoot()
    install(originalRoot)

    const newDocumentRoot = freshRoot()

    expect(isInstalled(newDocumentRoot)).toBe(false)
    expect(installedAt(newDocumentRoot)).toBeUndefined()
  })

  it("uninstall() removes the sentinel so a later install() reinstalls fresh (Theorem D.1(b))", () => {
    const root = freshRoot()
    vi.spyOn(Date, "now").mockReturnValueOnce(1).mockReturnValueOnce(2)

    const first = install(root)
    uninstall(root)

    expect(isInstalled(root)).toBe(false)

    const second = install(root)
    expect(second.installedAt).not.toBe(first.installedAt)

    vi.restoreAllMocks()
  })

  it("defaults to document.documentElement when no root is given", () => {
    expect(isInstalled()).toBe(false)

    const layer = install()

    expect(layer.root).toBe(document.documentElement)
    expect(isInstalled()).toBe(true)

    document.documentElement.removeAttribute("data-transport-bootstrap")
  })
})
