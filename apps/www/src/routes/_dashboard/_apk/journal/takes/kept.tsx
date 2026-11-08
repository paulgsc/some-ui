import type { ComponentProps, JSX } from "react"
import { useState } from "react"
import {
  phoneProjectStore,
  STUDIO_WORDS,
  StudioRecords,
} from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { ideaHome } from "@/lib/idea-hearing"
import { deletableStudioTakes } from "@/lib/my-data"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { BACK, StudioPage } from "@/components/studio/layout"

/**
 * The phone's projects, what home marks deletable, and a player: the
 * phone's alone, so no other build carries the link (`build.paths.ts`).
 */
const keptPorts =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? (): ComponentProps<typeof StudioRecords>["ports"] => ({
        store: phoneProjectStore(),
        deletable: deletableStudioTakes,
        player: audioPlayer,
        home: ideaHome,
      })
    : null

/**
 * What Studio keeps (MD4), under Studio's Takes (SFEED1): every take, on the
 * take pattern's rows, with Delete… on one home marks deletable, which opens
 * My data on it. In the Android app alone, as it was on Studio's Home.
 */
const Kept = (): JSX.Element => {
  const navigate = useNavigate()
  // Made once, as the screen first shows.
  const [ports] = useState(() => keptPorts?.() ?? null)
  return (
    <StudioPage
      heading={STUDIO_WORDS.records.heading}
      back={
        <Link to="/journal/takes" className={BACK}>
          {STUDIO_INDEX_WORDS.backTo("takes")}
        </Link>
      }
    >
      {ports !== null && (
        <StudioRecords
          ports={ports}
          openInMyData={(note) =>
            void navigate({
              to: "/settings/data/$kind",
              params: { kind: "studio" },
              search: { note },
            })
          }
        />
      )}
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/takes/kept")({
  component: Kept,
})
