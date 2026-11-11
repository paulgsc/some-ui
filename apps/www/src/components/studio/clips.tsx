/**
 * Studio's Library (SFEED7, epic #2670 decision 5): every clip kept, the
 * newest first, each opening its own page, where its before and after show
 * step by step as a user saw them. The list is testing's index and each
 * frame is home's (`studioClipsQuery`, `clipFrameQuery`); this only draws
 * their outcomes. A frame home doesn't hold shows its label and why, never a
 * broken image; away from home, the page lists only the labels and says so.
 * Picking a clip for an episode comes with the episode's own page.
 */
import type { JSX, ReactNode } from "react"
import { useState } from "react"
import { assertNever } from "@some-ui/core-utils"
import type { Clip, ClipSide } from "@some-ui/video-render"
import { refUrl } from "@some-ui/video-render"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { useHomeLink } from "@/lib/home-link"
import type { FrameShown } from "@/lib/studio-clips"
import { clipFrameQuery, studioClipsQuery } from "@/lib/studio-clips"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { OutLink, Part, ReadList, TILE } from "./layout"

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

/** Why a frame isn't shown, in the person's terms, or `null` when it is. */
function missing(
  shown: FrameShown | undefined,
  made: ClipSide["made"]
): string | null {
  if (shown === undefined) return null
  switch (shown.kind) {
    case "frame":
    case "unpaired": {
      return null
    }
    case "not-taken": {
      return made === "walk" ? WORDS.notTaken : WORDS.notKept
    }
    case "away": {
      return WORDS.homeAway
    }
    case "unreadable": {
      return WORDS.unreadable
    }
    default: {
      return assertNever(shown)
    }
  }
}

/** One screen: home's frame above its label, or its label and why there's no frame. */
const Frame = ({
  id,
  side,
  made,
  snip,
}: {
  id: string
  side: "before" | "after"
  made: ClipSide["made"]
  snip: ClipSide["snips"][number]
}): JSX.Element => {
  const { data } = useQuery(clipFrameQuery(id, side, snip.file))
  // Bytes that read as base64 but don't decode as an image (a truncated PNG)
  // show as their label and why, never as a broken image.
  const [undecodable, setUndecodable] = useState(false)
  const shows = data?.kind === "frame" && !undecodable
  const why = undecodable ? WORDS.unreadable : missing(data, made)
  return (
    <li className="flex flex-col gap-1">
      {shows ? (
        <img
          src={data.src}
          alt={snip.label}
          onError={() => {
            setUndecodable(true)
          }}
          className="border-border/60 w-full rounded-xl border"
        />
      ) : null}
      <span className="text-sm">{snip.label}</span>
      {why === null ? null : (
        <span className="text-muted-foreground text-xs">{why}</span>
      )}
    </li>
  )
}

/** One side of a clip: its screens in order, and who recorded them. */
const Side = ({
  id,
  name,
  side,
  atHome,
}: {
  id: string
  name: "before" | "after"
  side: ClipSide
  atHome: boolean
}): JSX.Element => (
  <>
    <ol className="flex flex-col gap-3">
      {side.snips.map((snip) =>
        atHome ? (
          <Frame
            key={snip.file}
            id={id}
            side={name}
            made={side.made}
            snip={snip}
          />
        ) : (
          <li key={snip.file} className="text-sm">
            {snip.label}
          </li>
        )
      )}
    </ol>
    <p className="text-muted-foreground text-xs">
      {side.made === "walk" ? WORDS.walked : WORDS.recorded}
    </p>
  </>
)

/** One clip's page, by its id, or that it's gone from the Library. */
export const ClipScreen = ({ id }: { id: string }): JSX.Element => (
  <Read>
    {(clips) => {
      const clip = clips.find((c) => c.id === id)
      if (clip === undefined)
        return <p className="text-muted-foreground text-sm">{WORDS.gone}</p>
      return <ClipPage clip={clip} />
    }}
  </Read>
)

/** A clip's page: its frames from home when this phone is paired, else its labels. */
const ClipPage = ({ clip }: { clip: Clip }): JSX.Element => {
  // While the phone's own record of its pairing is still being read, the
  // page says nothing about home: the labels show, and no line appears only
  // to vanish a moment later.
  const { link } = useHomeLink()
  const atHome = link.kind === "paired"
  return (
    <>
      <h2 className="text-lg leading-snug font-bold">{clip.title}</h2>
      <p className="text-muted-foreground text-sm">
        {WORDS.landed(clip.landed)}
      </p>
      {link.kind !== "unpaired" ? null : (
        <p className="text-muted-foreground text-sm">{WORDS.onlyLabels}</p>
      )}
      <Part label={WORDS.before}>
        {clip.before === null ? (
          <p className="text-muted-foreground text-sm">{WORDS.nothingBefore}</p>
        ) : (
          <Side id={clip.id} name="before" side={clip.before} atHome={atHome} />
        )}
      </Part>
      <Part label={WORDS.after}>
        <Side id={clip.id} name="after" side={clip.after} atHome={atHome} />
      </Part>
      <OutLink href={refUrl(clip.change)}>{WORDS.open}</OutLink>
    </>
  )
}
