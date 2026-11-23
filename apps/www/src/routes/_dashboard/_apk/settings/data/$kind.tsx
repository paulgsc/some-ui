import type { JSX } from "react"
import { keepStudioUseStores } from "@/routes/_dashboard/_apk/-studio-use-stores"
import { createFileRoute } from "@tanstack/react-router"

import { DeviceMyDataKind } from "@/components/settings/device-my-data"

// Studio's stores for what uses each take (INUSE): an `if` statement, which
// the route's code splitting keeps in both its chunks; an expression
// statement (`env && keep()`) it would drop.
if (import.meta.env.VITE_DEVICE_BACKEND === "true") keepStudioUseStores()

/**
 * One kind of recording in My data (MY-DATA MD2, #2476): newest first.
 * `?note=<id>` opens the delete sheet on that recording when home marks it
 * deletable (MD3, #2477): the way another screen's "Delete…" opens My data
 * on a record rather than deleting it in place.
 */
const KindPage = (): JSX.Element => {
  const { kind } = Route.useParams()
  const { note } = Route.useSearch()
  return (
    <div className="max-w-xl space-y-4">
      {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
        <DeviceMyDataKind kind={kind} note={note} />
      ) : null}
    </div>
  )
}

type KindSearch = { note?: string }

function validateKindSearch(search: Record<string, unknown>): KindSearch {
  const { note } = search
  return typeof note === "string" && note !== "" ? { note } : {}
}

export const Route = createFileRoute("/_dashboard/_apk/settings/data/$kind")({
  validateSearch: validateKindSearch,
  component: KindPage,
})
