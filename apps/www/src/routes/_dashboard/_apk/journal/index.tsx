import type { ComponentProps, JSX } from "react"
import { useEffect, useState } from "react"
import { useConfirmSheet } from "@some-ui/shared"
import type {
  Project,
  StudioCopy,
  StudioShare,
  WingLink,
} from "@some-ui/soundbites"
import {
  keptIdeasForHome,
  LIBRARY_WORDS,
  phoneProjectStore,
  phoneStudioKeeping,
  STUDIO_WORDS,
  studioFiles,
  StudioHome,
  StudioRecords,
  TakeLibrary,
} from "@some-ui/soundbites"
import { audioPlayer } from "@some-ui/voice-capture"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { FEED_WORDS, VIDEOS_WORDS } from "@/lib/call-videos/words"
import { deviceListener } from "@/lib/device-listen"
import type { Feed } from "@/lib/feeds"
import { FEEDS, isFeed } from "@/lib/feeds"
import { studioVideos } from "@/lib/home-link/studio-videos"
import { ideaHome } from "@/lib/idea-hearing"
import { keepIdeas } from "@/lib/idea-keeping"
import { useAsyncIntent, useIntentEffect } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { shareStudio } from "@/lib/journal-share"
import { libraryTakes } from "@/lib/library-takes"
import { deletableStudioTakes } from "@/lib/my-data"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { keepStudio } from "@/lib/studio-keeping"
import { takesHome } from "@/lib/take-library"
import { FeedVideosScreen } from "@/components/call-videos"
import { CopyButton } from "@/components/copy-button"
import { PairHomeLink } from "@/components/pair-home-link"

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
    home: ideaHome,
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

/**
 * Takes on home (ST32), with the phone's own takes with no scene to record
 * there, in the Android app alone, so no other build carries the link
 * (`build.paths.ts`).
 */
const TAKE_PORTS =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? { home: takesHome, player: audioPlayer, phone: libraryTakes() }
    : null

const Takes = (): JSX.Element | null => {
  if (TAKE_PORTS === null) return null
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
        {LIBRARY_WORDS.heading}
      </h1>
      <TakeLibrary
        ports={TAKE_PORTS}
        pair={<PairHomeLink>{WORDS.pair.pair}</PairHomeLink>}
      />
      <Link
        to="/journal"
        className="text-muted-foreground self-start text-sm underline underline-offset-4"
      >
        {LIBRARY_WORDS.back}
      </Link>
    </div>
  )
}

/**
 * A feed's videos, the weekly call's (ST38) or Playoff Delta's (FEED4):
 * watch, share to YouTube and save the link, in the Android app alone, as
 * Takes on home is.
 */
const Videos = ({ feed }: { feed: Feed }): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
      {FEED_WORDS[feed].heading}
    </h1>
    <FeedVideosScreen
      feed={feed}
      pair={<PairHomeLink>{WORDS.pair.pair}</PairHomeLink>}
    />
    <Link
      to="/journal"
      className="text-muted-foreground self-start text-sm underline underline-offset-4"
    >
      {VIDEOS_WORDS.back}
    </Link>
  </div>
)

/**
 * An episode's upload copy onto the clipboard (SH5), as Jobs' paste kit
 * copies: in the Android app only, as sharing is.
 */
const studioCopy: StudioCopy | undefined =
  import.meta.env.VITE_DEVICE_BACKEND === "true"
    ? ({ text, what }): JSX.Element => <CopyButton text={text} what={what} />
    : undefined

/**
 * The Studio wing's Home (lib/wings): a video made in sittings (STUDIO
 * ST4), with the ways in to New idea (ST18) and Your ideas (ST19)
 * (`StudioHome`).
 * Making something to publish, so not a study tool and not under Practice's
 * soundbites, though it records the same way (`@some-ui/voice-capture`).
 * Opened from Your ideas on a video an idea became, it opens that one.
 */
const StudioRoute = (): JSX.Element => {
  const { project, records, takes, videos } = Route.useSearch()
  useEffect(() => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return
    keepStudio(phoneStudioKeeping())
    // The ideas sent whole go home once a route has handed them in (ST26).
    keepIdeas({ forHome: keptIdeasForHome() })
  }, [])
  if (records === true && import.meta.env.VITE_DEVICE_BACKEND === "true") {
    return <Records />
  }
  if (takes === true && TAKE_PORTS !== null) return <Takes />
  if (videos !== undefined && import.meta.env.VITE_DEVICE_BACKEND === "true") {
    return <Videos feed={videos} />
  }
  return (
    <>
      <StudioHome
        share={studioShare}
        copy={studioCopy}
        ports={studioPorts}
        ideaLink={IdeaLink}
        ideasLink={IdeasLink}
        initialProject={project}
      />
      {import.meta.env.VITE_DEVICE_BACKEND === "true" && (
        <div className="mx-auto mt-4 flex w-full max-w-md flex-col gap-2">
          <Link
            to="/journal"
            search={{ takes: true }}
            className="text-muted-foreground self-start text-sm underline underline-offset-4"
          >
            {LIBRARY_WORDS.open}
          </Link>
          {FEEDS.map((feed) => (
            <Link
              key={feed}
              to="/journal"
              search={{ videos: feed }}
              className="text-muted-foreground self-start text-sm underline underline-offset-4"
            >
              {FEED_WORDS[feed].open}
            </Link>
          ))}
          <Link
            to="/journal"
            search={{ records: true }}
            className="text-muted-foreground self-start text-sm underline underline-offset-4"
          >
            {WORDS.records.open}
          </Link>
        </div>
      )}
    </>
  )
}

/**
 * `?project`: the video to open on, as Your ideas links one an idea became;
 * `?records`: what Studio keeps (MD4); `?takes`: Takes on home (ST32);
 * `?videos`: a feed's videos, the weekly call's (ST38) or Playoff Delta's
 * (FEED4).
 */
type StudioSearch = {
  project?: string
  records?: true
  takes?: true
  videos?: Feed
}

function validateStudioSearch(search: Record<string, unknown>): StudioSearch {
  const { project, records, takes, videos } = search
  return {
    ...(typeof project === "string" && project !== "" ? { project } : {}),
    ...(records === true || records === "true" ? { records: true } : {}),
    ...(takes === true || takes === "true" ? { takes: true } : {}),
    ...(isFeed(videos) ? { videos } : {}),
  }
}

export const Route = createFileRoute("/_dashboard/_apk/journal/")({
  validateSearch: validateStudioSearch,
  component: StudioRoute,
})
