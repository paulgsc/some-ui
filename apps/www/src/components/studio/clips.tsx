/**
 * Studio's Library (SFEED7, epic #2670 decision 5): every clip kept, the
 * newest first, each opening its own page, where its before and after show
 * step by step as a user saw them. The read is the query's
 * (`studioClipsQuery`); this only draws its outcome. Picking a clip for an
 * episode comes with the episode's own page.
 */
import type { JSX, ReactNode } from "react"
import { Button, Notice } from "@some-ui/shared"
import type { Clip, ClipSide } from "@some-ui/video-render"
import { refUrl } from "@some-ui/video-render"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import { clipUrl, studioClipsQuery } from "@/lib/studio-clips"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { Part, TILE } from "./layout"

const WORDS = STUDIO_INDEX_WORDS.clips

/** The clips once read, or what stands in for them until then. */
const Read = ({
  children,
}: {
  children: (clips: ReadonlyArray<Clip>) => ReactNode
}): JSX.Element =>
  matchQueryOutcome(queryOutcome(useQuery(studioClipsQuery)), {
    pending: () => (
      <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    ),
    failed: (_error, retry) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{WORDS.away}</p>
        <Button size="sm" variant="outline" onClick={retry}>
          {STUDIO_INDEX_WORDS.tryAgain}
        </Button>
      </div>
    ),
    ready: (clips, refreshError) => (
      <>
        {refreshError !== undefined && (
          <Notice
            tone="warning"
            dismissible
            action={{
              label: STUDIO_INDEX_WORDS.tryAgain,
              onClick: refreshError.retry,
            }}
          >
            {WORDS.stale}
          </Notice>
        )}
        {children(clips)}
      </>
    ),
  })

/** The Library: each clip a link to its page. */
export const ClipsList = (): JSX.Element => (
  <Read>
    {(clips) =>
      // A clip's page is the phone's ("apk"), as this list is (A3).
      clips.length === 0 || !hasAudience("apk") ? (
        <p className="text-muted-foreground text-sm">{WORDS.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {clips.map((clip) => (
            <li key={clip.id}>
              <Link
                to="/journal/clips/$clip"
                params={{ clip: clip.id }}
                className={TILE}
              >
                <span className="text-base font-bold">{clip.title}</span>
                <span className="text-muted-foreground text-sm">
                  {WORDS.landed(clip.landed)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )
    }
  </Read>
)

/** One side of a clip: a walk's screens in order, or the session's recording. */
const Side = ({ id, side }: { id: string; side: ClipSide }): JSX.Element =>
  side.made === "session" ? (
    <>
      <a
        href={clipUrl(id, side.video)}
        target="_blank"
        rel="noreferrer"
        className="text-brand self-start text-sm font-semibold underline underline-offset-4"
      >
        {WORDS.watch}
      </a>
      <p className="text-muted-foreground text-xs">{WORDS.recorded}</p>
    </>
  ) : (
    <>
      <ol className="flex flex-col gap-3">
        {side.snips.map((snip) => (
          <li key={snip.file} className="flex flex-col gap-1">
            <img
              src={clipUrl(id, snip.file)}
              alt={snip.label}
              loading="lazy"
              className="border-border/60 w-full rounded-xl border"
            />
            <span className="text-sm">{snip.label}</span>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">{WORDS.walked}</p>
    </>
  )

/** One clip's page, by its id, or that it's gone from the Library. */
export const ClipScreen = ({ id }: { id: string }): JSX.Element => (
  <Read>
    {(clips) => {
      const clip = clips.find((c) => c.id === id)
      if (clip === undefined)
        return <p className="text-muted-foreground text-sm">{WORDS.gone}</p>
      return (
        <>
          <h2 className="text-lg leading-snug font-bold">{clip.title}</h2>
          <p className="text-muted-foreground text-sm">
            {WORDS.landed(clip.landed)}
          </p>
          <Part label={WORDS.before}>
            {clip.before === null ? (
              <p className="text-muted-foreground text-sm">
                {WORDS.nothingBefore}
              </p>
            ) : (
              <Side id={clip.id} side={clip.before} />
            )}
          </Part>
          <Part label={WORDS.after}>
            <Side id={clip.id} side={clip.after} />
          </Part>
          <a
            href={refUrl(clip.change)}
            target="_blank"
            rel="noreferrer"
            className="text-brand self-start text-sm font-semibold underline underline-offset-4"
          >
            {WORDS.open}
          </a>
        </>
      )
    }}
  </Read>
)
