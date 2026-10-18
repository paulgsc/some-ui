/**
 * aph kept on home, wired (LA9, docs/learner-data-authority.md): one runtime
 * per page load over the app's home link and aph's store (`./kept-runtime`),
 * and the shared watch (`./kept-watch`) for as long as aph's strip mounts
 * `useAphHome`, once its person opted in (`keepAphOnHome`).
 *
 * `@some-ui/aph` is the phone's alone, so only aph's screens import it
 * (packages/some-vite-config/AUDIENCES.md): they hand its store and its
 * exchange in (`AphKeeping`), and this module names its types alone.
 */
import { useEffect, useSyncExternalStore } from "react"
import type { AphStore, AphWhere } from "@some-ui/aph"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import { homeLink } from "./index"
import type { KeptState } from "./kept-model"
import type { Kept } from "./kept-runtime"
import { createKept } from "./kept-runtime"
import type { KeptRecord } from "./kept-watch"
import { askKept, watchKept } from "./kept-watch"

export type { KeptState } from "./kept-model"

/** aph's store, and one exchange with home over it. */
export type AphKeeping = {
  store: AphStore
  exchange: (store: AphStore, send: HomeCall) => Promise<HomeExchanged>
}

let home: Kept | null = null

/** One runtime per page load, over the first `aph` handed in. */
function aphHome(aph: AphKeeping): Kept {
  home ??= createKept({
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

/** aph's store as the watch sees it (`./kept-watch`). */
function recordOf(aph: AphKeeping): KeptRecord {
  return {
    kept: () => aph.store.where().kind === "home",
    revision: () => editsOf(aph.store.where()),
    subscribe: aph.store.subscribe,
  }
}

/**
 * The aph screens' view of keeping on home, and the watch for as long as
 * they are mounted.
 */
export function useAphHome(aph: AphKeeping): KeptState {
  const current = aphHome(aph)
  useEffect(() => watchKept(recordOf(aph), aphHome(aph)), [aph])
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

/** "Try now": asks for a run, as any moment the watch names would. */
export function askAph(aph: AphKeeping): void {
  askKept(recordOf(aph), aphHome(aph), document)
}
