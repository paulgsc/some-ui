/**
 * Where aph is kept, on aph's screens in the Android app (LA9,
 * docs/learner-data-authority.md), through the shared strip
 * (`components/keep-on-home.tsx`). Phone-only (`build.paths.ts`); the route
 * hands in aph's store and exchange (`AphKeeping`).
 */
import type { JSX } from "react"
import { useSyncExternalStore } from "react"
import { counted } from "@some-ui/core-utils"

import type { AphKeeping } from "@/lib/home-link/aph"
import { askAph, keepAphOnHome, useAphHome } from "@/lib/home-link/aph"
import { KeepOnHome } from "@/components/keep-on-home"

export const DeviceKeepOnHome = ({ aph }: { aph: AphKeeping }): JSX.Element => {
  const where = useSyncExternalStore(aph.store.subscribe, aph.store.where)
  const run = useAphHome(aph)
  const entries = aph.store.get().entries.length
  return (
    <KeepOnHome
      label="Where aph is kept"
      name="aph"
      run={run}
      kept={
        where.kind === "home"
          ? {
              waiting: where.unsent,
              more: (host) => [
                ...(where.refused.length > 0
                  ? [
                      `${host} refused ${counted(where.refused.length, "entry", "entries")}, kept here: ${where.refused[0]?.why ?? ""}`,
                    ]
                  : []),
                ...(where.hidden > 0
                  ? [
                      `${counted(where.hidden, "entry", "entries")} waiting here clash with ${host}'s record and aren't shown.`,
                    ]
                  : []),
                ...(!where.pulled && run.last?.kind !== "synced"
                  ? [
                      `Until ${host} answers, this shows only what this phone hasn't sent.`,
                    ]
                  : []),
              ],
            }
          : null
      }
      offer={(host) =>
        `Send ${counted(entries, "entry", "entries")} and the settings to ${host}, and keep aph there from now on? This phone then keeps only the settings and what ${host} hasn't confirmed, and syncs while aph is open.`
      }
      keep={() => keepAphOnHome(aph)}
      ask={() => askAph(aph)}
    />
  )
}
