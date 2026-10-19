/**
 * aph's lane (LA9, docs/learner-data-authority.md): what this phone holds
 * that home has not confirmed, sent by aph's exchange through the one wiring
 * (`./lanes`). Kept on home, the phone holds only that, so the opt-in moves
 * aph's record (`keepOnHome`), and stopping brings it back from home's
 * (`bringBack`). Its record moves with each edit on this phone.
 *
 * `@some-ui/aph` is the phone's alone, so only aph's screens import it
 * (packages/some-vite-config/AUDIENCES.md): they hand its store and its
 * exchanges in (`AphKeeping`), and this module names its types alone.
 */
import { useSyncExternalStore } from "react"
import type { AphStore, AphWhere } from "@some-ui/aph"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import type { Lane, LaneCounts } from "./lanes"

/** aph's store, and its two exchanges with home over it. */
export type AphKeeping = {
  store: AphStore
  exchange: (store: AphStore, send: HomeCall) => Promise<HomeExchanged>
  bringBack: (store: AphStore, send: HomeCall) => Promise<HomeExchanged>
}

function editsOf(where: AphWhere): number {
  return where.kind === "home" ? where.edits : -1
}

let lane: Lane | null = null

/** aph's lane, over the first `aph` handed in. */
export function aphLane(aph: AphKeeping): Lane {
  lane ??= declared(aph)
  return lane
}

function declared({ store, ...aph }: AphKeeping): Lane {
  return {
    id: "aph",
    scopes: ["aph"],
    exchange: (send) =>
      store.where().kind === "home" || store.keepOnHome()
        ? aph.exchange(store, send)
        : Promise.resolve({
            kind: "failed",
            why: "this phone couldn't move aph's record",
          }),
    revision: () => editsOf(store.where()),
    subscribe: store.subscribe,
    useCounts: (): LaneCounts => {
      const where = useSyncExternalStore(store.subscribe, store.where)
      const { entries } = useSyncExternalStore(store.subscribe, store.get)
      const home = where.kind === "home" ? where : null
      return {
        held: {},
        refused: { aph: home?.refused.length ?? 0 },
        waiting: home?.unsent ?? entries.length,
        away: home?.unsent ?? null,
        hidden: home?.hidden ?? 0,
        pulled: home?.pulled ?? true,
        offered: entries.length,
      }
    },
    keptBefore: () => store.where().kind === "home",
    switchOn: store.keepOnHome,
    bringBack: (send) => aph.bringBack(store, send),
  }
}
