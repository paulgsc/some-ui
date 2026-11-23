import type { JSX } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { COOKING_WORDS } from "@/lib/cooking/words"
import { CookingPage } from "@/components/cooking"

/** Cooking (LEDGER-WEB, #3425; C1116–C1119, C1160–C1164): the work in flight as trains. */
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
