/**
 * A clip's frames from home, the Android app's only (`build.paths.ts`): each
 * side's frames read together through the paired link (`clipSideQuery`), a
 * frame home doesn't hold shown as its label and why, never a broken image,
 * and, away from home, the labels alone with a line saying so. While the
 * phone's own record of its pairing is still being read, the page says
 * nothing about home: the labels show, and no line appears only to vanish.
 */
import type { JSX } from "react"
import { useState } from "react"
import { assertNever } from "@some-ui/core-utils"
import type { Clip, ClipSide } from "@some-ui/video-render"
import { useQuery } from "@tanstack/react-query"

import { useHomeLink } from "@/lib/home-link"
import type { FrameShown } from "@/lib/studio-clips/frames"
import { clipSideQuery } from "@/lib/studio-clips/home"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { ClipParts, LabelList } from "./clip-parts"

const WORDS = STUDIO_INDEX_WORDS.clips

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
  shown: data,
  made,
  snip,
}: {
  shown: FrameShown | undefined
  made: ClipSide["made"]
  snip: ClipSide["snips"][number]
}): JSX.Element => {
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

/** One side's frames from home, read together, each shown as it came. */
const HomeFrames = ({
  id,
  name,
  side,
}: {
  id: string
  name: "before" | "after"
  side: ClipSide
}): JSX.Element => {
  const files = side.snips.map((snip) => snip.file)
  const { data } = useQuery(clipSideQuery(id, name, files))
  return (
    <>
      {side.snips.map((snip, i) => (
        <Frame key={snip.file} shown={data?.[i]} made={side.made} snip={snip} />
      ))}
    </>
  )
}

/** One side: its frames from home when this phone is paired, else its labels. */
const sideOf = (
  atHome: boolean,
  id: string,
  name: "before" | "after",
  side: ClipSide
): JSX.Element =>
  atHome ? (
    <HomeFrames id={id} name={name} side={side} />
  ) : (
    <LabelList side={side} />
  )

/** A clip's before and after, each frame from home when this phone is paired. */
export const ClipFrames = ({ clip }: { clip: Clip }): JSX.Element => {
  const { link } = useHomeLink()
  return (
    <>
      {link.kind !== "unpaired" ? null : (
        <p className="text-muted-foreground text-sm">{WORDS.onlyLabels}</p>
      )}
      <ClipParts
        clip={clip}
        before={
          clip.before === null
            ? null
            : sideOf(link.kind === "paired", clip.id, "before", clip.before)
        }
        after={sideOf(link.kind === "paired", clip.id, "after", clip.after)}
      />
    </>
  )
}
