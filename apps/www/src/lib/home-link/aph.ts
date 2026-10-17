/**
 * aph kept on home, wired: one runtime per page load over the app's home
 * link and aph's store (`./aph-runtime`), and what asks it to run (LA9,
 * docs/learner-data-authority.md).
 *
 * Only for aph, only once its person opted in (`keepAphOnHome`, from the aph
 * screens' second press), and only while aph is open with the app in the
 * foreground. Then it asks when aph opens, when aph is changed on this
 * phone, when the app comes back to the foreground, when the network comes
 * back, when the phone is paired, and when the link frees up after turning a
 * run away busy. Never on a timer.
 *
 * `@some-ui/aph` is the phone's alone, so only aph's screens import it
 * (packages/some-vite-config/AUDIENCES.md): they hand its store and its
 * exchange in (`AphKeeping`), and this module names its types alone.
 */
import { useEffect, useSyncExternalStore } from "react"
import type { AphStore, AphWhere, Exchanged, HomeCall } from "@some-ui/aph"

import type { AphHomeState } from "./aph-model"
import type { AphHome } from "./aph-runtime"
import { createAphHome } from "./aph-runtime"
import { homeLink } from "./index"

export type { AphHomeState } from "./aph-model"

/** aph's store, and one exchange with home over it. */
export type AphKeeping = {
  store: AphStore
  exchange: (store: AphStore, send: HomeCall) => Promise<Exchanged>
}

let home: AphHome | null = null

/** One runtime per page load, over the first `aph` handed in. */
function aphHome(aph: AphKeeping): AphHome {
  home ??= createAphHome({
    exchange: (send) => aph.exchange(aph.store, send),
    keep: (run) => homeLink().keep(run),
    paired: () => homeLink().getSnapshot().link.kind === "paired",
    now: Date.now,
  })
  return home
}

function editsOf(where: AphWhere): number {
  return where.kind === "home" ? where.edits : -1
}

/** Asks for a run when aph is kept on home and the app is in front. */
function ask(aph: AphKeeping, doc: Document): void {
  if (aph.store.where().kind !== "home") return
  if (doc.visibilityState !== "visible") return
  aphHome(aph).want()
}

/**
 * Asks once now and on each of the moments above, until the returned
 * unsubscribe is called.
 */
function watchAph(
  aph: AphKeeping,
  doc: Document = document,
  win: Window = window
): () => void {
  const link = homeLink()
  let edits = editsOf(aph.store.where())
  let paired = link.getSnapshot().link.kind === "paired"
  let idle = link.getSnapshot().activity.kind === "idle"

  const onStore = (): void => {
    const now = editsOf(aph.store.where())
    if (now === edits) return
    edits = now
    ask(aph, doc)
  }
  const onLink = (): void => {
    const { link: pairing, activity } = link.getSnapshot()
    const nowPaired = pairing.kind === "paired"
    const nowIdle = activity.kind === "idle"
    const freed = nowIdle && !idle
    const turnedAway = aphHome(aph).getSnapshot().last?.kind === "busy"
    if ((nowPaired && !paired) || (freed && turnedAway)) ask(aph, doc)
    paired = nowPaired
    idle = nowIdle
  }
  const onBack = (): void => {
    ask(aph, doc)
  }

  const unsubscribeStore = aph.store.subscribe(onStore)
  const unsubscribeLink = link.subscribe(onLink)
  doc.addEventListener("visibilitychange", onBack)
  win.addEventListener("online", onBack)
  ask(aph, doc)
  return () => {
    unsubscribeStore()
    unsubscribeLink()
    doc.removeEventListener("visibilitychange", onBack)
    win.removeEventListener("online", onBack)
  }
}

/**
 * The aph screens' view of keeping on home, and the watch above for as long
 * as they are mounted.
 */
export function useAphHome(aph: AphKeeping): AphHomeState {
  const current = aphHome(aph)
  useEffect(() => watchAph(aph), [aph])
  return useSyncExternalStore(current.subscribe, current.getSnapshot)
}

/**
 * The opt-in's second press: aph is kept on home from now on. The switch is
 * a change to the store, so the strip's watch asks for the first run.
 * False when the phone would not keep the switch.
 */
export function keepAphOnHome(aph: AphKeeping): boolean {
  return aph.store.keepOnHome()
}

/** "Try now": asks for a run, as any other moment above would. */
export function askAph(aph: AphKeeping): void {
  ask(aph, document)
}
