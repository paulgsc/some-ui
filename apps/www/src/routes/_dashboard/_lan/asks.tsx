import type { JSX } from "react"
import { createFileRoute, Outlet } from "@tanstack/react-router"

import { ASKS_WORDS } from "@/lib/asks/words"
import { AsksNav } from "@/components/asks"

/**
 * Asks (docs/asks.md): what waits on the owner, on the desktop web of the
 * home network only (LAN-only and account-only, `_lan.tsx`; never the
 * public site or the Android app, C1097). A nav of the kinds of ask beside
 * one view (`./asks/$view.tsx`), a kind of ask or the pivot (C1200). Each
 * open `ask` issue is read from GitHub's public list as the page opens, so
 * filing one puts it here and closing it takes it away. What the owner does
 * here stays in this tab until they copy its receipt (C1096).
 */
const AsksLayout = (): JSX.Element => (
  <section className="flex max-w-5xl flex-col gap-4">
    <div className="space-y-1">
      <h1 className="text-xl font-semibold">{ASKS_WORDS.title}</h1>
      <p className="text-muted-foreground text-sm">{ASKS_WORDS.intro}</p>
      <p className="text-muted-foreground text-sm">{ASKS_WORDS.kept}</p>
    </div>
    <div className="flex items-start gap-6">
      <AsksNav />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Outlet />
      </div>
    </div>
  </section>
)

export const Route = createFileRoute("/_dashboard/_lan/asks")({
  component: AsksLayout,
})
