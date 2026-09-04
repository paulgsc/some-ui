/**
 * G0.2 creation-trace drivers for the #1262 Gate 0 falsification harness.
 *
 * Each function creates a hardcoded-white, viewport-covering surface inside
 * an `attachShadow({mode: "open"})` root, via one of three distinct
 * orderings of "populate" vs. "connect" vs. "mutate" that the falsification
 * spec this harness answers names as independent traces (G0.2) — the
 * issue's own original repro only ever proved a root that was already
 * connected and populated before the page settled, which cannot distinguish
 * any of these three from each other or say which (if any) a fix must
 * handle differently. No assertion lives here; see the Gate 0 specs that
 * call these against a frame oracle (frames.ts) or the plain pipeline
 * internals (G0.1).
 *
 * The surface is deliberately `position: fixed; inset: 0` — full-viewport —
 * so a frame oracle sampling the whole page reliably catches it regardless
 * of where #host-anchor sits in normal flow.
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
    // Population happened above, on a host with no parent at all — the
    // shadow tree existed, populated, before it was reachable from the
    // document tree by any route. Connection is the very next statement:
    // the earliest possible instant this content could ever have painted.
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
    // Connect first, with no shadow root at all yet — an ordinary, inert
    // light-DOM element the existing pipeline can (and does) see, and finds
    // nothing to theme in (it has no background of its own).
    anchor.appendChild(host)
    const root = host.attachShadow({ mode: "open" })
    const surface = document.createElement("div")
    surface.id = "shadow-trace-surface"
    surface.setAttribute("style", css)
    root.appendChild(surface)
  }, WHITE_SURFACE_CSS)
}

/**
 * Trace 3 setup — an open root exists, connected, from before the page ever
 * settles, with its surface initially transparent (carrying no color
 * evidence either way). Call this *before* `waitForClassification()`, so
 * the root is present for whatever the pipeline's initial pass does or does
 * not do with it.
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
 * Trace 3 mutation — after classification has settled and the veil is down,
 * mutate the *existing* surface's own background in place. No new nodes, no
 * new root: this isolates the observer gap (does a mutation inside an
 * already-registered open root get observed at all?) from the creation-
 * timing questions traces 1 and 2 test.
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
