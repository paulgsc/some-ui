import type { ComponentType, JSX } from "react"
import { StudyGlyph, TalkGlyph, TrendGlyph } from "@some-ui/shared"
import { Wrench } from "lucide-react"

import type { WingId } from "@/lib/wings"

/**
 * Each wing's glyph, wherever a wing is named: the foyers and the web
 * sidebar's header. A wing without one shows its name alone.
 */
export const WING_GLYPHS: Partial<
  Record<WingId, ComponentType<{ className?: string; "aria-hidden"?: boolean }>>
> = {
  practice: StudyGlyph,
  self: TrendGlyph,
  studio: TalkGlyph,
  operate: Wrench,
}

/** A wing's glyph, or nothing for a wing without one. */
export const WingGlyph = ({
  wing,
  className,
}: {
  wing: WingId
  className?: string
}): JSX.Element | null => {
  const Glyph = WING_GLYPHS[wing]
  return Glyph ? <Glyph aria-hidden className={className} /> : null
}
