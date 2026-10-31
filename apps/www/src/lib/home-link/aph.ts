/**
 * aph's lane (LA15, docs/learner-data-authority.md): what this phone holds
 * that home has not confirmed, sent by aph's exchange through the one wiring
 * (`./lanes`). A paired phone keeps aph on home: the first run moves the
 * record there (`keepOnHome`), and from then on the phone holds only the
 * settings and what home has not confirmed. Its record moves with each edit
 * on this phone.
 *
 * `@some-ui/aph` is the phone's alone, so only aph's screens import it
 * (packages/some-vite-config/AUDIENCES.md): they hand its store and its
 * exchange in (`AphKeeping`), and this module names its types alone. The
 * lane is handed to the app shell while aph's screens are mounted
 * (`useHandLane`), so aph drains while it is open.
 */
import { useSyncExternalStore } from "react"
import type { AphStore, AphWhere } from "@some-ui/aph"
import type { HomeCall, HomeExchanged } from "@some-ui/core-utils"

import type { Lane, LaneCounts } from "./lanes"

/** aph's store, and its exchange with home over it. */
export type AphKeeping = {
  store: AphStore
  exchange: (store: AphStore, send: HomeCall) => Promise<HomeExchanged>
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
        // On the phone, every entry waits for the first run.
        waiting: home?.unsent ?? entries.length,
        hidden: home?.hidden ?? 0,
        pulled: home?.pulled ?? true,
      }
    },
  }
}
