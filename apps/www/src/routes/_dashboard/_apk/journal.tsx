import type { JSX } from "react"
import { useConfirmSheet } from "@some-ui/shared"
import { Journal, journalFiles, phoneJournalStore } from "@some-ui/soundbites"
import { createFileRoute } from "@tanstack/react-router"

import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { letGoJournal, shareJournal } from "@/lib/journal-share"

/**
 * An episode's takes out through the share sheet, in the primer's order,
 * held and let go as Practice's study export is (`soundbites.tsx`).
 */
const ShareJournal = ({
  taking,
  takes,
}: {
  taking: boolean
  takes: number
}): JSX.Element => {
  const share = useAsyncIntent(
    () =>
      shareJournal((exportedAt, timeZone) =>
        journalFiles(phoneJournalStore(), exportedAt, timeZone)
      ),
    {
      presentation: "interactive",
    }
  )
  const { ask, sheet } = useConfirmSheet()
  useIntentEffect(share, ({ outcome, sent }) => {
    if (outcome !== "shared" || sent === null) return
    ask({
      title: "Did they arrive?",
      description:
        "Once they have, the takes that went out can leave the phone.",
      confirm: "They arrived: let them go",
      keep: "Keep them here",
      onConfirm: () => letGoJournal(phoneJournalStore(), sent),
    })
  })
  return (
    <section className="space-y-2">
      <p className="text-muted-foreground text-sm">
        takes.json and each take&apos;s audio, in the primer&apos;s order. You
        pick where they go; once they arrive, the episode leaves the phone.
      </p>
      <IntentButton
        state={share.state}
        onPress={() => share.start(undefined)}
        disabled={taking || takes === 0}
        size="sm"
        idleLabel="Share takes"
        workingLabel="Preparing..."
      />
      {sheet}
    </section>
  )
}

const journalFooter =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? (state: { taking: boolean; takes: number }): JSX.Element => (
        <ShareJournal {...state} />
      )
    : undefined

/**
 * The Studio wing's Home (lib/wings): the Build Journal's voice takes, read
 * against a primer an agent saved to Drive. Making something to publish, so
 * not a study tool and not under Practice's soundbites, though it records the
 * same way (`@some-ui/voice-capture`).
 */
const JournalRoute = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-2xl font-bold tracking-tight">Studio</h1>
    <Journal footer={journalFooter} />
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/journal")({
  component: JournalRoute,
})
