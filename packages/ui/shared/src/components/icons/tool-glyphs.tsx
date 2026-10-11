import type { JSX, ReactNode } from "react"

import { cn } from "../../lib/utils"

/**
 * Filled, round-cornered glyphs for the phone's tools: the bottom bar and the
 * tiles on Home. Solid shapes rather than lucide's outlines, so each reads as
 * one soft object instead of a frame around empty space (the same reason the
 * mark is one mochi). Same props as a lucide icon where the bar uses them.
 */
type GlyphProps = { className?: string; "aria-hidden"?: boolean }

const Glyph = ({
  className,
  children,
}: GlyphProps & { children: ReactNode }): JSX.Element => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
    className={cn("size-5", className)}
  >
    {children}
  </svg>
)

export const HomeGlyph = ({ className }: GlyphProps): JSX.Element => (
  <Glyph className={className}>
    <path d="M3.5 10.3a2 2 0 0 1 .7-1.5l6.5-5.6a2 2 0 0 1 2.6 0l6.5 5.6a2 2 0 0 1 .7 1.5V19a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" />
  </Glyph>
)

export const StudyGlyph = ({ className }: GlyphProps): JSX.Element => (
  <Glyph className={className}>
    <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H8a4 4 0 0 1 3 1.35V20a3.5 3.5 0 0 0-3-1.5H3.5A1.5 1.5 0 0 1 2 17z" />
    <path d="M22 5.5A1.5 1.5 0 0 0 20.5 4H16a4 4 0 0 0-3 1.35V20a3.5 3.5 0 0 1 3-1.5h4.5A1.5 1.5 0 0 0 22 17z" />
  </Glyph>
)

export const TalkGlyph = ({ className }: GlyphProps): JSX.Element => (
  <Glyph className={className}>
    <rect x="8" y="2" width="8" height="13" rx="4" />
    <path
      d="M5 11a7 7 0 0 0 14 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <rect x="10.8" y="17.5" width="2.4" height="4.5" rx="1.2" />
  </Glyph>
)

/** aph: three rising bars, its figures through the day. */
export const TrendGlyph = ({ className }: GlyphProps): JSX.Element => (
  <Glyph className={className}>
    <rect x="3" y="12" width="5" height="9" rx="2.5" />
    <rect x="9.5" y="7" width="5" height="14" rx="2.5" />
    <rect x="16" y="3" width="5" height="18" rx="2.5" />
  </Glyph>
)
