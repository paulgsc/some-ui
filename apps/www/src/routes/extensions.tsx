import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ExtensionsPage } from "@/components/extensions/extensions-page"

/**
 * The comb's stable, shareable address — the page a signed-out visitor also
 * gets at `"/"` (see `routes/index.tsx`), with a way back instead of the
 * front door's chrome.
 *
 * Public and standalone (the `mission.tsx` archetype), which means
 * `"/extensions"` has to be in `__root.tsx`'s public-route set or a
 * signed-out visitor following the link lands on the passkey screen instead.
 */
const Extensions = (): JSX.Element => <ExtensionsPage chrome="back" />

export const Route = createFileRoute("/extensions")({
  component: Extensions,
})
