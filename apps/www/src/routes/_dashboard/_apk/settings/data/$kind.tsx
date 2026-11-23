import type { JSX } from "react"
import { useEffect } from "react"
import { keptIdeaStore, phoneProjectStore } from "@some-ui/soundbites"
import { createFileRoute } from "@tanstack/react-router"

import { keepUseStores } from "@/lib/take-uses"
import { DeviceMyDataKind } from "@/components/settings/device-my-data"

/**
 * One kind of recording in My data (MY-DATA MD2, #2476): newest first.
 * `?note=<id>` opens the delete sheet on that recording when home marks it
 * deletable (MD3, #2477): the way another screen's "Delete…" opens My data
 * on a record rather than deleting it in place. Studio's ideas and videos
 * go to what tells each take's use (INUSE, `lib/take-uses`), so a row and
 * the sheet say which take is in use.
 */
const KindPage = (): JSX.Element => {
  const { kind } = Route.useParams()
  const { note } = Route.useSearch()
  useEffect(() => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return
    keepUseStores({
      ideas: () => keptIdeaStore().list(),
      videos: () => phoneProjectStore().list(),
      subscribe: (listener) => phoneProjectStore().subscribe(listener),
    })
  }, [])
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
