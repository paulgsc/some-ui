import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { ExtensionsPage } from "@/components/extensions/extensions-page"

/**
 * The comb’s stable, shareable address, with a way back.
 *
 * Public and standalone (the `mission.tsx` archetype), which means
 * `"/extensions"` has to be in `__root.tsx`'s public-route set or a
 * signed-out visitor following the link lands on the passkey screen instead.
 */
const Extensions = (): JSX.Element => <ExtensionsPage />

export const Route = createFileRoute("/extensions")({
  component: Extensions,
})
