import type { JSX } from "react"
import { useEffect } from "react"
import { useConfirmSheet } from "@some-ui/shared"
import type {
  IdeaListener,
  Project,
  StudioShare,
  WingLink,
} from "@some-ui/soundbites"
import {
  keptTimeLog,
  letGoHeldTakes,
  notesForHome,
  phoneProjectStore,
  sittingKey,
  STUDIO_WORDS,
  studioFiles,
  StudioHome,
} from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { deviceListener } from "@/lib/device-listen"
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

/** The phone's recognizer for a note said in Watch, in the Android app (ST5). */
const studioPorts: { listener: IdeaListener } | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { listener: deviceListener }
    : undefined

const IdeaLink: WingLink = ({ className, children }) => (
  <Link to="/journal/idea" className={className}>
    {children}
  </Link>
)

const studioShare: StudioShare | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? (props): JSX.Element => <ShareStudio {...props} />
    : undefined

/**
 * The Studio wing's Home (lib/wings): a video made in sittings (STUDIO
 * ST4), with the way in to New idea (ST18) (`StudioHome`).
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
    <StudioHome share={studioShare} ports={studioPorts} ideaLink={IdeaLink} />
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/")({
  component: StudioRoute,
})
