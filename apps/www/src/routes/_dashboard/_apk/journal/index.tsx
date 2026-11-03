import type { ComponentProps, JSX } from "react"
import { useEffect, useState } from "react"
import { useConfirmSheet } from "@some-ui/shared"
import type { Project, StudioShare, WingLink } from "@some-ui/soundbites"
import {
  keptLetGo,
  keptTimeLog,
  letGoDeletedTakes,
  letGoHeldTakes,
  letGoOnDrive,
  notesForHome,
  phoneProjectStore,
  sittingKey,
  STUDIO_WORDS,
  studioFiles,
  StudioHome,
  StudioRecords,
  waitingIds,
} from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { deviceListener } from "@/lib/device-listen"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { shareStudio } from "@/lib/journal-share"
import { deletableStudioTakes } from "@/lib/my-data"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { keepStudio } from "@/lib/studio-keeping"

const WORDS = STUDIO_WORDS

/**
 * The video's files out through the share sheet, held and confirmed as
 * Practice's study export is (`soundbites.tsx`): once the person says they
 * arrived, the takes that went out are marked as in Drive too.
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

/**
 * In the Android app: the phone's recognizer for a note said in Watch (ST5),
 * and the shell's refresh port, so a pull down on Start or a show reads the
 * phone's videos again (SHOW SH6). Both are native-only (`build.paths.ts`),
 * so a web build, where the flag is false, leaves them out of its bundle.
 */
const studioPorts: ComponentProps<typeof StudioHome>["ports"] =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { listener: deviceListener, refresh: screenRefreshers.register }
    : undefined

const IdeaLink: WingLink = ({ className, children }) => (
  <Link to="/journal/idea" className={className}>
    {children}
  </Link>
)

const IdeasLink: WingLink = ({ className, children }) => (
  <Link to="/journal/ideas" className={className}>
    {children}
  </Link>
)

const studioShare: StudioShare | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? (props): JSX.Element => <ShareStudio {...props} />
    : undefined

/**
 * The Studio wing's Home (lib/wings): a video made in sittings (STUDIO
 * ST4), with the ways in to New idea (ST18) and Your ideas (ST19)
 * (`StudioHome`).
 * Making something to publish, so not a study tool and not under Practice's
 * soundbites, though it records the same way (`@some-ui/voice-capture`).
 * Opened from Your ideas on a video an idea became, it opens that one.
 */
/**
 * What Studio keeps (MD4): every take, on the take pattern's rows, with
 * Delete… on one home marks deletable, which opens My data on it.
 */
const Records = (): JSX.Element => {
  const navigate = useNavigate()
  // The phone's projects, what home marks deletable, and a player, once.
  const [ports] = useState(() => ({
    store: phoneProjectStore(),
    deletable: deletableStudioTakes,
    player: audioPlayer,
  }))
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
        {WORDS.records.heading}
      </h1>
      <StudioRecords
        ports={ports}
        openInMyData={(note) =>
          void navigate({
            to: "/settings/data/$kind",
            params: { kind: "studio" },
            search: { note },
          })
        }
      />
      <Link
        to="/journal"
        className="text-muted-foreground self-start text-sm underline underline-offset-4"
      >
        {WORDS.records.back}
      </Link>
    </div>
  )
}

const StudioRoute = (): JSX.Element => {
  const { project, records } = Route.useSearch()
  useEffect(() => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return
    const store = phoneProjectStore()
    keepStudio({
      store,
      timeLog: () => keptTimeLog().read(),
      notesForHome,
      // As the owner chose, read at each let-go (HF11, LG1): none before.
      letGoHeldTakes: (held) => letGoHeldTakes(store, held, keptLetGo().read()),
      // Home's receipt for a take My data deleted (MD3): whatever the choice.
      letGoDeletedTakes: (deleted) => letGoDeletedTakes(store, deleted),
      letGo: () => keptLetGo().read(),
      waitingIds,
      // Home's word that Drive has a take too (HF11), as the owner chose.
      letGoOnDrive: (onDrive) =>
        letGoOnDrive(store, onDrive, keptLetGo().read()),
      sittingKey,
    })
  }, [])
  if (records === true && import.meta.env.VITE_DEVICE_BACKEND === "true") {
    return <Records />
  }
  return (
    <>
      <StudioHome
        share={studioShare}
        ports={studioPorts}
        ideaLink={IdeaLink}
        ideasLink={IdeasLink}
        initialProject={project}
      />
      {import.meta.env.VITE_DEVICE_BACKEND === "true" && (
        <Link
          to="/journal"
          search={{ records: true }}
          className="text-muted-foreground mx-auto mt-4 block w-full max-w-md text-sm underline underline-offset-4"
        >
          {WORDS.records.open}
        </Link>
      )}
    </>
  )
}

/**
 * `?project`: the video to open on, as Your ideas links one an idea became;
 * `?records`: what Studio keeps (MD4).
 */
type StudioSearch = { project?: string; records?: true }

function validateStudioSearch(search: Record<string, unknown>): StudioSearch {
  const { project, records } = search
  return {
    ...(typeof project === "string" && project !== "" ? { project } : {}),
    ...(records === true || records === "true" ? { records: true } : {}),
  }
}

export const Route = createFileRoute("/_dashboard/_apk/journal/")({
  validateSearch: validateStudioSearch,
  component: StudioRoute,
})
