import { AphSettingsPanel } from "@some-ui/aph"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard/_apk/aph/settings")({
  component: AphSettingsPanel,
})
