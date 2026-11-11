/**
 * What a clip's page draws in every build: its before and after as parts,
 * each side's screens in order and who recorded them, and a side's labels
 * alone. Where the frames come from is the Android app's alone
 * (`./clip-frames`).
 */
import type { JSX, ReactNode } from "react"
import type { Clip, ClipSide } from "@some-ui/video-render"

import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { Part } from "./layout"

const WORDS = STUDIO_INDEX_WORDS.clips

/**
 * A clip's before and after: each side's screens as `before` and `after`
 * draw them (list items), in order, and who recorded them.
 */
export const ClipParts = ({
  clip,
  before,
  after,
}: {
  clip: Clip
  before: ReactNode
  after: ReactNode
}): JSX.Element => (
  <>
    <Part label={WORDS.before}>
      {clip.before === null ? (
        <p className="text-muted-foreground text-sm">{WORDS.nothingBefore}</p>
      ) : (
        <Made side={clip.before}>{before}</Made>
      )}
    </Part>
    <Part label={WORDS.after}>
      <Made side={clip.after}>{after}</Made>
    </Part>
  </>
)

/** A side's screens, and who recorded them. */
const Made = ({
  side,
  children,
}: {
  side: ClipSide
  children: ReactNode
}): JSX.Element => (
  <>
    <ol className="flex flex-col gap-3">{children}</ol>
    <p className="text-muted-foreground text-xs">
      {side.made === "walk" ? WORDS.walked : WORDS.recorded}
    </p>
  </>
)

/** A side's screens by their labels alone. */
export const LabelList = ({ side }: { side: ClipSide }): JSX.Element => (
  <>
    {side.snips.map((snip) => (
      <li key={snip.file} className="text-sm">
        {snip.label}
      </li>
    ))}
  </>
)
