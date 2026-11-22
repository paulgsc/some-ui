import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { tabReceipts } from "@/lib/asks/kept"
import { ASKS_WORDS } from "@/lib/asks/words"
import { AsksPage } from "@/components/asks"

/**
 * Asks (docs/asks.md): what waits on the owner, decisions and checklists,
 * on the desktop web of the home network only (LAN-only and account-only,
 * `_lan.tsx`; never the public site or the Android app, C1097). Each open
 * `ask` issue is read from GitHub's public list as the page opens, so filing
 * one puts it here and closing it takes it away. What the owner does here
 * stays in this tab until they copy its receipt (C1096).
 */
const AsksRoute = (): JSX.Element => (
  <section className="flex max-w-3xl flex-col gap-4">
    <div className="space-y-1">
      <h1 className="text-xl font-semibold">{ASKS_WORDS.title}</h1>
      <p className="text-muted-foreground text-sm">{ASKS_WORDS.intro}</p>
      <p className="text-muted-foreground text-sm">{ASKS_WORDS.kept}</p>
    </div>
    <AsksPage kept={tabReceipts} />
  </section>
)

export const Route = createFileRoute("/_dashboard/_lan/asks")({
  component: AsksRoute,
})
