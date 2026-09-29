import type { JSX } from "react"
import { useState } from "react"
import type { Reporting } from "@some-ui/lesson-crm"
import { RoundCrm } from "@some-ui/lesson-crm"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"

import { mapFileHostError } from "@/lib/intent/errors"
import { createRoundCrmClient } from "@/lib/round-crm-client"

/** The CRM's outcomes on this app's overlay plane, as `/lessons` reports them. */
const reporting: Reporting = {
  notify: (notice) => {
    if (notice.tone === "success") {
      toast.success(notice.title)
      return
    }
    const { retry } = notice
    toast.error(notice.title, {
      description: notice.error.summary,
      ...(retry ? { action: { label: "Retry", onClick: retry } } : {}),
    })
  },
  mapError: mapFileHostError,
}

/**
 * The round CRM: the LeetType rounds `file_host` serves every learner. LAN
 * only because `@some-ui/lesson-crm` is a `lan` workspace; the server itself
 * answers its operator routes only to a passkey session whose subject is in
 * `OPERATOR_SUBJECTS` (401 otherwise, or 403 for anyone else signed in).
 *
 * Bounded (`lib/route-bounds`), like `/lessons`.
 */
const RoundsRoute = (): JSX.Element => {
  const [client] = useState(createRoundCrmClient)
  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <h1 className="shrink-0 text-xl font-semibold">Rounds</h1>
      <div className="min-h-0 flex-1">
        <RoundCrm client={client} reporting={reporting} />
      </div>
    </section>
  )
}

export const Route = createFileRoute("/_dashboard/_lan/rounds")({
  staticData: { bounded: true },
  component: RoundsRoute,
})
