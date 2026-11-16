import type { JSX } from "react"
import { useState, useSyncExternalStore } from "react"
import {
  RECONCILE_WORDS,
  STUDIO_WORDS,
  TakeReconcile,
} from "@some-ui/soundbites"
import { createFileRoute } from "@tanstack/react-router"

import { phoneDeleting } from "@/lib/my-data"
import { deletesKind } from "@/lib/take-reconcile"
import { reconcilePorts } from "@/lib/take-reconcile/ports"
import { PairHomeLink } from "@/components/pair-home-link"
import { DeleteSheetView } from "@/components/settings/device-my-data-delete"
import { StudioPage } from "@/components/studio/layout"

/** The page's ports, in the Android app alone (`build.paths.ts`). */
const PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true" ? reconcilePorts() : null

/**
 * My data's delete path (LA19), shared: its sheet, opened on one take, says
 * what goes and what stays and leaves its receipt, as it does in My data.
 */
const useDelete = (): {
  sheet: JSX.Element
  ask: (id: string) => void
} => {
  const [deleting] = useState(phoneDeleting)
  const { sheet } = useSyncExternalStore(
    deleting.subscribe,
    deleting.getSnapshot
  )
  return {
    sheet: (
      <DeleteSheetView
        sheet={sheet}
        onConfirm={deleting.confirm}
        onClose={deleting.close}
      />
    ),
    ask: (id) => deleting.ask("studio", [id]),
  }
}

/** The reconciling, once the build hands home in. */
const Reconcile = ({
  ports,
}: {
  ports: NonNullable<typeof PORTS>
}): JSX.Element => {
  const { sheet, ask } = useDelete()
  return (
    <>
      <TakeReconcile
        ports={ports}
        pair={<PairHomeLink>{STUDIO_WORDS.pair.pair}</PairHomeLink>}
        deletable={(take) => deletesKind(take.of)}
        onDelete={(take) => ask(take.id)}
      />
      {sheet}
    </>
  )
}

/**
 * Takes › Needs your attention (HEARD3, #3075): every take home couldn't
 * hear well, by what went wrong, each to hear and keep, record again, or
 * delete through My data's delete path. The Android app's alone, so no
 * other build carries the link (`build.paths.ts`).
 */
const Attention = (): JSX.Element => (
  <StudioPage heading={RECONCILE_WORDS.heading} back="takes">
    {PORTS !== null && <Reconcile ports={PORTS} />}
  </StudioPage>
)

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/takes/attention"
)({ component: Attention })
