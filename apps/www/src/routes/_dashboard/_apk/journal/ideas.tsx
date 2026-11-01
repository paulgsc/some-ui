import type { JSX } from "react"
import type { IdeaListener, IdeaShare } from "@some-ui/soundbites"
import { homeHearing, IdeaShelf, STUDIO_WORDS } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { ideaWords, phoneIdeaListener } from "@/lib/idea-hearing"
import { useAsyncIntent } from "@/lib/intent"
import { IntentButton } from "@/lib/intent/render"
import { shareIdea } from "@/lib/journal-share"

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
const capture: { listener: IdeaListener } | undefined = device
  ? { listener: phoneIdeaListener(homeHearing) }
  : undefined

/** Home's words for a new idea's said answers (ST26), in the Android app. */
const shelf = device ? { heard: ideaWords } : undefined

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

/** Your ideas, in the Studio wing (STUDIO ST19): every idea kept, and where each is. */
const IdeasRoute = (): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
      {WORDS.heading}
    </h1>
    <IdeaShelf
      ports={shelf}
      capture={capture}
      share={share}
      studio={openVideo}
      newIdea={
        <Link to="/journal/idea" className={link}>
          {STUDIO_WORDS.idea.newIdea}
        </Link>
      }
    />
    <Link to="/journal" className={link}>
      {STUDIO_WORDS.idea.back}
    </Link>
  </div>
)

export const Route = createFileRoute("/_dashboard/_apk/journal/ideas")({
  component: IdeasRoute,
})
