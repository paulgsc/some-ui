import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { FRONT_DESK_WORDS } from "@/lib/front-desk"
import {
  SettingsBlock,
  SettingsPage,
} from "@/components/settings/settings-page"

/** My data (MY-DATA, paulgsc/some-ui#2473). */
const DataPage = (): JSX.Element => (
  <SettingsPage id="data">
    <SettingsBlock>
      <p className="text-muted-foreground text-sm">
        {FRONT_DESK_WORDS.dataEmpty}
      </p>
    </SettingsBlock>
  </SettingsPage>
)

export const Route = createFileRoute("/_dashboard/_apk/settings/data")({
  component: DataPage,
})
