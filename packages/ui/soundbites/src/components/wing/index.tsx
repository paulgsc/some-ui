/**
 * The Studio wing's two pages as the app lays them out (www's `/journal`
 * and `/journal/idea`): each screen under the wing's heading, in the
 * route's column. The app hands in its links, so a page with no router
 * (www's ui-fit phone page) mounts the same pages the routes do.
 */
import type { JSX, ReactNode } from "react"
import type { IdeaCaptureProps } from "@soundbites/components/idea"
import { IdeaCapture } from "@soundbites/components/idea"
import type { StudioProps } from "@soundbites/components/studio"
import { Studio } from "@soundbites/components/studio"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { Lightbulb } from "lucide-react"

const WORDS = STUDIO_WORDS

/** A link the app draws to another of the wing's pages, styled as given. */
export type WingLink = (props: {
  className: string
  children: ReactNode
}) => ReactNode

type StudioHomeProps = Omit<StudioProps, "newIdea"> & {
  /** The link to New idea. */
  ideaLink: WingLink
}

/**
 * The wing's Home: Studio, with the way in to New idea (ST18) as the big
 * button on a Start with no video and a quiet link once there is one.
 */
export const StudioHome = ({
  ideaLink: IdeaLink,
  ...studio
}: StudioHomeProps): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-2xl font-bold tracking-tight">{WORDS.heading}</h1>
    <Studio
      {...studio}
      newIdea={{
        big: (
          <IdeaLink className="bg-card border-brand focus-visible:ring-ring flex items-center gap-3 rounded-2xl border-2 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none">
            <Lightbulb aria-hidden className="text-brand size-6 shrink-0" />
            <span className="min-w-0">
              <span className="block text-base font-extrabold">
                {WORDS.idea.newIdea}
              </span>
              <span className="text-muted-foreground block text-sm">
                {WORDS.idea.newIdeaLine}
              </span>
            </span>
          </IdeaLink>
        ),
        quiet: (
          <IdeaLink className="text-muted-foreground underline">
            {WORDS.idea.newIdea}
          </IdeaLink>
        ),
      }}
    />
  </div>
)

type NewIdeaPageProps = Omit<IdeaCaptureProps, "back"> & {
  /** The link back to the wing's Home. */
  backLink: WingLink
}

/** New idea (ST18), with the way back to the wing's Home. */
export const NewIdeaPage = ({
  backLink: BackLink,
  ...capture
}: NewIdeaPageProps): JSX.Element => (
  <div className="mx-auto flex w-full max-w-md flex-col gap-4">
    <h1 className="text-muted-foreground text-sm font-bold tracking-wider uppercase">
      {WORDS.idea.heading}
    </h1>
    <IdeaCapture
      {...capture}
      back={
        <BackLink className="text-muted-foreground text-sm underline underline-offset-4">
          {WORDS.idea.back}
        </BackLink>
      }
    />
  </div>
)
