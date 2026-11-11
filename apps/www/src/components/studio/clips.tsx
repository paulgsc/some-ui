/**
 * Studio's Library (SFEED7, epic #2670 decision 5): every clip kept, the
 * newest first, each opening its own page, where its before and after show
 * step by step as a user saw them. The list is testing's index and each
 * frame is home's, which only the Android app reads (`./clip-frames`); this
 * only draws their outcomes. A frame home doesn't hold shows its label and why, never a
 * broken image; away from home, the page lists only the labels and says so.
 * Picking a clip for an episode comes with the episode's own page.
 */
import type { JSX, ReactNode } from "react"
import type { Clip } from "@some-ui/video-render"
import { refUrl } from "@some-ui/video-render"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { studioClipsQuery } from "@/lib/studio-clips"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { ClipFrames } from "./clip-frames"
import { ClipParts, LabelList } from "./clip-parts"
import { OutLink, ReadList, TILE } from "./layout"

const WORDS = STUDIO_INDEX_WORDS.clips

const Read = ({
  children,
}: {
  children: (items: ReadonlyArray<Clip>) => ReactNode
}): JSX.Element => (
  <ReadList query={studioClipsQuery} words={WORDS}>
    {children}
  </ReadList>
)

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
          {/* Only the Android app reaches home; a web build lists the labels. */}
          {import.meta.env.VITE_DEVICE_BACKEND === "true" ? (
            <ClipFrames clip={clip} />
          ) : (
            <ClipParts
              clip={clip}
              before={
                clip.before === null ? null : <LabelList side={clip.before} />
              }
              after={<LabelList side={clip.after} />}
            />
          )}
          <OutLink href={refUrl(clip.change)}>{WORDS.open}</OutLink>
        </>
      )
    }}
  </Read>
)
