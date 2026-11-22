import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { COOKING_WORDS } from "@/lib/cooking/words"
import { CookingPage } from "@/components/cooking"

/**
 * Cooking (LEDGER-WEB, #3425; C1116–C1119, C1160, C1161): the work in
 * flight as trains on their way to what the owner wants, on the desktop web
 * of the home network only (LAN-only and account-only, `_lan.tsx`; never the
 * public site, and the Android app only links here from Settings). The run's
 * record and what GitHub says of each stop are read as the page opens and
 * when asked again; nothing is kept or sent.
 */
const CookingRoute = (): JSX.Element => (
  <section className="flex max-w-5xl flex-col gap-4">
    <CookingPage
      heading={
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{COOKING_WORDS.title}</h1>
          <p className="text-muted-foreground text-sm">{COOKING_WORDS.intro}</p>
        </div>
      }
    />
  </section>
)

export const Route = createFileRoute("/_dashboard/_lan/cooking")({
  component: CookingRoute,
})
