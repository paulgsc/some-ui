import type { FC } from "react"

/**
 * The article a screen sits in. It spans the page's 16px gutter (the page
 * pads by `px-4`) and pads it back, so the pinned job can bleed to the
 * page's edges inside the article rather than past it.
 */
export const SCREEN_ARTICLE = "-mx-4 flex flex-col gap-4 px-4"

/** The job, pinned above whatever the screen scrolls under it (Def. 9.3). */
export const PinnedJob: FC<{ pinned: string | undefined }> = ({ pinned }) =>
  pinned === undefined ? null : (
    <p className="sticky top-0 z-10 -mx-4 border-b border-border bg-background px-4 py-2 text-pretty text-sm font-medium text-foreground">
      {pinned}
    </p>
  )

/** A screen's pinned job, title and body, each where the file gives one. */
export const ScreenHeading: FC<{
  screen: {
    readonly pinned?: string | undefined
    readonly title?: string | undefined
    readonly body?: string | undefined
  }
}> = ({ screen }) => (
  <>
    <PinnedJob pinned={screen.pinned} />
    {screen.title !== undefined && (
      <h2 className="text-pretty text-base font-semibold text-foreground">
        {screen.title}
      </h2>
    )}
    {screen.body !== undefined && (
      <p className="whitespace-pre-line text-pretty text-sm leading-relaxed text-foreground">
        {screen.body}
      </p>
    )}
  </>
)
