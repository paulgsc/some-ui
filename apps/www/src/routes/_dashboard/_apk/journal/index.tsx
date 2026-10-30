import type { JSX } from "react"
import { useEffect } from "react"
import { useConfirmSheet } from "@some-ui/shared"
import type { Project, StudioShare } from "@some-ui/soundbites"
import {
  keptTimeLog,
  letGoHeldTakes,
  notesForHome,
  phoneProjectStore,
  sittingKey,
  Studio,
  STUDIO_WORDS,
  studioFiles,
} from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Lightbulb } from "lucide-react"

import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { shareStudio } from "@/lib/journal-share"
import { keepStudio } from "@/lib/studio-keeping"

const WORDS = STUDIO_WORDS

/**
 * The video's files out through the share sheet, held and confirmed as
 * Practice's study export is (`soundbites.tsx`): once the person says they
 * arrived, the takes that went out leave the phone.
 */
const ShareStudio = ({
  project,
  onArrived,
}: Parameters<StudioShare>[0]): JSX.Element => {
  const share = useAsyncIntent(
    (shared: Project) =>
      shareStudio(
        (exportedAt, timeZone) =>
          studioFiles(phoneProjectStore(), shared, exportedAt, timeZone),
        WORDS.share.title
      ),
    { presentation: "interactive" }
  )
  const { ask, sheet } = useConfirmSheet()
  useIntentEffect(share, ({ outcome, sent }) => {
    if (outcome !== "shared" || sent.length === 0) return
    ask({
      title: WORDS.share.arrivedTitle,
      description: WORDS.share.arrivedLine,
      confirm: WORDS.share.arrivedYes,
      keep: WORDS.share.arrivedNo,
      onConfirm: () => onArrived(sent),
    })
  })
  return (
    <>
      <IntentButton
        state={share.state}
        onPress={() => share.start(project)}
        size="sm"
        idleLabel={WORDS.done.share}
        workingLabel={WORDS.done.sharing}
      />
      {sheet}
    </>
  )
}

const studioShare: StudioShare | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? (props): JSX.Element => <ShareStudio {...props} />
    : undefined

/**
 * The Studio wing's Home (lib/wings): New idea first (STUDIO ST18), then a
 * video made in sittings, its scenes recorded one at a time against a primer Claude saved
 * to Drive (STUDIO ST4).
 * Making something to publish, so not a study tool and not under Practice's
 * soundbites, though it records the same way (`@some-ui/voice-capture`).
 */
const StudioRoute = (): JSX.Element => {
  useEffect(() => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return
    const store = phoneProjectStore()
    keepStudio({
      store,
      timeLog: () => keptTimeLog().read(),
      notesForHome,
      letGoHeldTakes: (held) => letGoHeldTakes(store, held),
      sittingKey,
    })
  }, [])
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{WORDS.heading}</h1>
      <Link
        to="/journal/idea"
        className="bg-card border-brand focus-visible:ring-ring flex items-center gap-3 rounded-2xl border-2 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Lightbulb aria-hidden className="text-brand size-6 shrink-0" />
        <span className="min-w-0">
          <span className="block text-base font-extrabold">
            {WORDS.idea.newIdea}
          </span>
          <span className="text-muted-foreground block text-sm">
            {WORDS.idea.newIdeaLine}
          </span>
        </span>
      </Link>
      <Studio share={studioShare} />
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/")({
  component: StudioRoute,
})
