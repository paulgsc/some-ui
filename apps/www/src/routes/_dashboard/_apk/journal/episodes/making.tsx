import type { ComponentProps, JSX } from "react"
import { useConfirmSheet } from "@some-ui/shared"
import type {
  Project,
  StudioCopy,
  StudioShare,
  WingLink,
} from "@some-ui/soundbites"
import {
  phoneProjectStore,
  STUDIO_WORDS,
  studioFiles,
  StudioHome,
} from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { deviceListener } from "@/lib/device-listen"
import { studioVideos } from "@/lib/home-link/studio-videos"
import { ideaHome } from "@/lib/idea-hearing"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { shareStudio } from "@/lib/journal-share"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"
import { CopyButton } from "@/components/copy-button"
import { BackLink } from "@/components/studio/layout"

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
 * the shell's refresh port, so a pull down on Start or a show reads the
 * phone's videos again (SHOW SH6), home, so a take says it is going home
 * only on a paired phone (ST34), and home's videos, which Finish hands an
 * episode to make (ST33). All four are native-only (`build.paths.ts`), so a
 * web build, where the flag is false, leaves them out of its bundle.
 */
const studioPorts: ComponentProps<typeof StudioHome>["ports"] =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? {
        listener: deviceListener,
        refresh: screenRefreshers.register,
        home: ideaHome,
        videos: studioVideos,
      }
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
 * An episode's upload copy onto the clipboard (SH5), as Jobs' paste kit
 * copies: in the Android app only, as sharing is.
 */
const studioCopy: StudioCopy | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? ({ text, what }): JSX.Element => <CopyButton text={text} what={what} />
    : undefined

/**
 * The videos made in sittings (STUDIO ST4), under Studio's Episodes
 * (SFEED1): the video kept on this phone, opened for a sitting, with the
 * ways in to New idea (ST18) and Your ideas (ST19) (`StudioHome`). Opened
 * from Your ideas on a video an idea became, it opens that one.
 */
const Making = (): JSX.Element => {
  const { project }: MakingSearch = Route.useSearch()
  return (
    <>
      <StudioHome
        heading={STUDIO_INDEX_WORDS.episodes.making}
        share={studioShare}
        copy={studioCopy}
        ports={studioPorts}
        ideaLink={IdeaLink}
        ideasLink={IdeasLink}
        initialProject={project}
      />
      <div className="mx-auto mt-4 flex w-full max-w-md flex-col">
        <BackLink to="episodes" />
      </div>
    </>
  )
}

/** `?project`: the video to open on, as Your ideas links one an idea became. */
type MakingSearch = { project?: string }

function validateMakingSearch(search: Record<string, unknown>): MakingSearch {
  const { project } = search
  return typeof project === "string" && project !== "" ? { project } : {}
}

export const Route = createFileRoute(
  "/_dashboard/_apk/journal/episodes/making"
)({
  validateSearch: validateMakingSearch,
  component: Making,
})
