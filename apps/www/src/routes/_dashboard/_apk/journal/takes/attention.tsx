import type { JSX } from "react"
import { useEffect } from "react"
import {
  phoneSoundbiteKeeping,
  RECONCILE_WORDS,
  STUDIO_WORDS,
  TakeReconcile,
} from "@some-ui/soundbites"
import { createFileRoute } from "@tanstack/react-router"

import { reconcileDeletes } from "@/lib/my-data"
import { keepSoundbites } from "@/lib/soundbite-keeping"
import { reconcilePorts } from "@/lib/take-reconcile/ports"
import { PairHomeLink } from "@/components/pair-home-link"
import {
  DeleteSheetView,
  useDeleting,
} from "@/components/settings/device-my-data-delete"
import { StudioPage } from "@/components/studio/layout"

/** The page's ports, in the Android app alone (`build.paths.ts`). */
const PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? reconcilePorts() : null

/**
 * The reconciling, its Delete… on My data's one sheet (LA19): on a take of
 * any kind home couldn't hear (#3076, HEARD4).
 */
const Reconcile = ({
  ports,
}: {
  ports: NonNullable<typeof PORTS>
}): JSX.Element => {
  const { sheet, deleting } = useDeleting()
  // A soundbite deleted here lets its copy go through their store, which
  // the soundbites' own page may not have handed in yet (HEARD4).
  useEffect(() => {
    keepSoundbites(phoneSoundbiteKeeping())
  }, [])
  return (
    <>
      <TakeReconcile
        ports={ports}
        pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
        deletable={(take) => reconcileDeletes(take.of)}
        onDelete={(take) => {
          if (reconcileDeletes(take.of)) deleting.ask(take.of, [take.id])
        }}
      />
      <DeleteSheetView
        sheet={sheet}
        onConfirm={deleting.confirm}
        onClose={deleting.close}
      />
    </>
  )
}

/**
 * Takes › Needs your attention (HEARD3, #3075): every take home couldn't
 * hear well, by what went wrong, each to hear and keep, record again, or
 * delete through My data's delete path. The Android app's alone
 * (`build.paths.ts`).
 */
const Attention = (): JSX.Element => (
  <StudioPage heading={RECONCILE_WORDS.heading} back="takes">
    {PORTS !== null && <Reconcile ports={PORTS} />}
  </StudioPage>
)

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/takes/attention"
)({ component: Attention })
