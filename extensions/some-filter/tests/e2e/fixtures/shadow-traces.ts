/**
 * G0.2 creation-trace drivers for the Gate 0 falsification harness (#1262).
 *
 * Each creates a hardcoded-white, viewport-covering surface inside an open
 * shadow root via one of three independent orderings of "populate" vs.
 * "connect" vs. "mutate". No assertion lives here.
 *
 * The surface is `position: fixed; inset: 0` so a whole-page frame oracle
 * catches it wherever #host-anchor sits.
 */

import type { Page } from "@playwright/test"

const WHITE_SURFACE_CSS =
  "position:fixed;inset:0;z-index:999999;margin:0;padding:0;background-color:rgb(255,255,255);"

const TRANSPARENT_SURFACE_CSS =
  "position:fixed;inset:0;z-index:999999;margin:0;padding:0;background-color:transparent;"

/** Trace 1 — an open root is populated on a *disconnected* host, then the host is inserted into the document. */
export async function traceDisconnectedThenInsert(page: Page): Promise<void> {
  await page.evaluate((css: string) => {
    const host = document.createElement("div")
    host.id = "shadow-trace-host"
    const root = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.id = "shadow-trace-surface"
    surface.setAttribute("style", css)
    root.appendChild(surface)
    // Populated on a detached host; connecting it is the earliest instant
    // this content could paint.
    const anchor = document.getElementById("host-anchor")
    if (anchor === null) throw new Error("fixture missing #host-anchor")
    anchor.appendChild(host)
  }, WHITE_SURFACE_CSS)
}

/** Trace 2 — `attachShadow()` is invoked on an *already-connected* host, followed by synchronous population. */
export async function traceAttachOnConnectedHost(page: Page): Promise<void> {
  await page.evaluate((css: string) => {
    const host = document.createElement("div")
    host.id = "shadow-trace-host"
    const anchor = document.getElementById("host-anchor")
    if (anchor === null) throw new Error("fixture missing #host-anchor")
    // Connect first, with no shadow root yet: an inert light-DOM element
    // with nothing to theme.
    anchor.appendChild(host)
    const root = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.id = "shadow-trace-surface"
    surface.setAttribute("style", css)
    root.appendChild(surface)
  }, WHITE_SURFACE_CSS)
}

/**
 * Trace 3 setup: an open root, connected before the page settles, with a
 * transparent surface. Call *before* `waitForClassification()`.
 */
export async function traceMutationSetup(page: Page): Promise<void> {
  await page.evaluate((css: string) => {
    const host = document.createElement("div")
    host.id = "shadow-trace-host"
    const root = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.id = "shadow-trace-surface"
    surface.setAttribute("style", css)
    root.appendChild(surface)
    const anchor = document.getElementById("host-anchor")
    if (anchor === null) throw new Error("fixture missing #host-anchor")
    anchor.appendChild(host)
  }, TRANSPARENT_SURFACE_CSS)
}

/**
 * Trace 3 mutation: after classification settles, mutate the existing
 * surface's background in place — isolating the observer question (is a
 * mutation inside a registered root seen?) from creation timing.
 */
export async function traceMutateExistingSurface(page: Page): Promise<void> {
  await page.evaluate((css: string) => {
    const host = document.getElementById("shadow-trace-host")
    const surface = host?.shadowRoot?.getElementById("shadow-trace-surface")
    if (surface === null || surface === undefined) {
      throw new Error("traceMutationSetup() must run before this")
    }
    surface.setAttribute("style", css)
  }, WHITE_SURFACE_CSS)
}
