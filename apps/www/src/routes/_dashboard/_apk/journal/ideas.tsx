import type { JSX } from "react"
import { useEffect, useState } from "react"
import type { IdeaShare } from "@some-ui/soundbites"
import {
  homeHearing,
  IdeaShelf,
  IdeasOnHome,
  keptIdeasForHome,
  phoneStudioKeeping,
  STUDIO_WORDS,
} from "@some-ui/soundbites"
import type { TurnListener } from "@some-ui/voice-capture"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { phoneIdeaListener } from "@/lib/idea-hearing"
import { ideasHome } from "@/lib/idea-home"
import { keepIdeas } from "@/lib/idea-keeping"
import { ideaBundleTakes } from "@/lib/idea-takes"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { shareIdea } from "@/lib/journal-share"
import { keepStudio } from "@/lib/studio-keeping"
import { PairHomeLink } from "@/components/pair-home-link"

const WORDS = STUDIO_WORDS.shelf

/** One idea out through the share sheet, as its text alone (ST19). */
const ShareIdea = ({ file }: Parameters<IdeaShare>[0]): JSX.Element => {
  const share = useAsyncIntent(
    (shared: typeof file) => shareIdea(shared, WORDS.shareTitle),
    { presentation: "interactive" }
  )
  return (
    <IntentButton
      state={share.state}
      onPress={() => share.start(file)}
      size="sm"
      idleLabel={WORDS.share}
      workingLabel={WORDS.sharing}
    />
  )
}

const device = import.meta.env.VITE_DEVICE_BACKEND === "true"

/**
 * Claude's questions, answered as `idea.tsx`'s are, in the Android app
 * (`lib/idea-hearing`).
 */
const capture: { listener: TurnListener } | undefined = device
  ? { listener: phoneIdeaListener(homeHearing) }
  : undefined

const share: IdeaShare | undefined = device
  ? (props): JSX.Element => <ShareIdea {...props} />
  : undefined

/** The way to the video an idea became: Studio, opened on that video. */
const openVideo = (project: string): JSX.Element => (
  <Link
    to="/journal"
    search={{ project }}
    className="bg-brand text-brand-foreground focus-visible:ring-ring rounded-2xl px-4 py-3 text-center text-base font-extrabold focus-visible:ring-2 focus-visible:outline-none"
  >
    {WORDS.openVideo}
  </Link>
)

const link =
  "text-muted-foreground text-sm underline underline-offset-4 self-start"

/** What the page shows: your ideas, or what home keeps of them (ST26 (c)). */
type IdeasSearch = { view?: "home" | "lists" }

function validateIdeasSearch(search: Record<string, unknown>): IdeasSearch {
  return search.view === "home" || search.view === "lists"
    ? { view: search.view }
    : {}
}

/**
 * Ideas on home and its lists (ST26 (c)): home through the link, and a said
 * answer played from this phone's desk while its take is still there, in
 * the Android app alone, so no other build carries the link
 * (`build.paths.ts`).
 */
const onHome = device ? { home: ideasHome, takes: ideaBundleTakes } : null

const OnHome = ({ lists }: { lists: boolean }): JSX.Element | null => {
  const navigate = useNavigate()
  // An answer's Delete… lets this phone's copy go through Studio's store, so
  // it is handed in here too, not only once Studio has opened (#2579).
  useEffect(() => {
    if (onHome !== null) keepStudio(phoneStudioKeeping())
  }, [])
  // The desk's runtime is the phone's one; built when the page first shows.
  const [takes] = useState(() => onHome?.takes() ?? null)
  if (onHome === null || takes === null) return null
  return (
    <IdeasOnHome
      home={onHome.home}
      takes={takes}
      initialLists={lists}
      pair={<PairHomeLink />}
      // An answer's Delete… opens My data on its recording (#2579, MD4).
      openInMyData={(note) =>
        void navigate({
          to: "/settings/data/$kind",
          params: { kind: "studio" },
          search: { note },
        })
      }
    />
  )
}

/**
 * Your ideas, in the Studio wing (STUDIO ST19): every idea kept, and where
 * each is; or, with `view`, what home keeps of the ideas sent whole, or the
 * lists they pick from (ST26 (c)).
 */
const IdeasRoute = (): JSX.Element => {
  // The ideas sent whole go home once a route has handed them in (ST26).
  useEffect(() => {
    if (device) keepIdeas({ forHome: keptIdeasForHome() })
  }, [])
  const { view } = Route.useSearch()
  if (view !== undefined) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
          {STUDIO_WORDS.onHome.heading}
        </h1>
        <OnHome key={view} lists={view === "lists"} />
        <Link to="/journal/ideas" className={link}>
          {WORDS.back}
        </Link>
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
        {WORDS.heading}
      </h1>
      <IdeaShelf
        capture={capture}
        share={share}
        studio={openVideo}
        newIdea={
          <Link to="/journal/idea" className={link}>
            {STUDIO_WORDS.idea.newIdea}
          </Link>
        }
      />
      {device && (
        <Link to="/journal/ideas" search={{ view: "home" }} className={link}>
          {STUDIO_WORDS.onHome.open}
        </Link>
      )}
      <Link to="/journal" className={link}>
        {STUDIO_WORDS.idea.back}
      </Link>
    </div>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/ideas")({
  validateSearch: validateIdeasSearch,
  component: IdeasRoute,
})
