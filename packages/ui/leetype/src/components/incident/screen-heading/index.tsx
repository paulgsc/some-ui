import type { FC } from "react"

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
