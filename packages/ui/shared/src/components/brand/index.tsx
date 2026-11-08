import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import {
  MOCHI_CHEEK as CHEEK,
  MOCHI_BODY,
  MOCHI_FACE,
} from "@some-ui/styles/brand/mark"
import type { SessionThemeId } from "@some-ui/styles/theme"
import { sessionThemeProps } from "@some-ui/styles/theme"

// The mark's geometry lives with the theme it is drawn in (`@some-ui/styles`,
// `brand/mark`), so a renderer outside the browser draws the same mark.
export { MOCHI_BODY, MOCHI_FACE } from "@some-ui/styles/brand/mark"

/**
 * The mark's shapes, for a host that composes them into its own `<svg>` (a
 * 64 box centred on 32,32). `brand` paints the theme's `--brand` with
 * `--brand-foreground` ink, a shine and cheeks; `current` is one colour with
 * the face cut out, for a glyph among `currentColor` icons.
 */
export const MochiShapes = ({
  tone,
}: {
  tone: "brand" | "current"
}): JSX.Element =>
  tone === "current" ? (
    <path d={`${MOCHI_BODY} ${MOCHI_FACE}`} fillRule="evenodd" />
  ) : (
    <>
      <path d={MOCHI_BODY} style={{ fill: "var(--brand)" }} />
      <ellipse
        cx="21"
        cy="19.5"
        rx="5.5"
        ry="3"
        transform="rotate(-32 21 19.5)"
        style={{ fill: "color-mix(in oklab, white 60%, var(--brand))" }}
      />
      <ellipse
        cx="19.5"
        cy="38.5"
        rx="3.4"
        ry="2.2"
        fill={CHEEK}
        opacity="0.7"
      />
      <ellipse
        cx="44.5"
        cy="38.5"
        rx="3.4"
        ry="2.2"
        fill={CHEEK}
        opacity="0.7"
      />
      <path d={MOCHI_FACE} style={{ fill: "var(--brand-foreground)" }} />
    </>
  )

type BrandMarkProps = {
  className?: string
  /**
   * `brand` paints the theme's mochi (`--brand`): use it where the mark is
   * shown *as the brand*. `current` inherits `currentColor`, where the mark
   * acts as a UI glyph (the sidebar's Home item, among lucide icons).
   */
  tone?: "brand" | "current"
  /**
   * Rendered as a labelled image. Leave it off wherever adjacent text already
   * names the thing (the wordmark, the "Home" label).
   */
  title?: string
  /**
   * The app's theme the mark's colours come from, where what it stands in
   * names one (a video template's brand slides, SFEED14); absent, the
   * theme around it.
   */
  theme?: SessionThemeId
}

export const BrandMark = ({
  className,
  tone = "current",
  title,
  theme,
}: BrandMarkProps): JSX.Element => (
  <svg
    viewBox="0 0 64 64"
    {...sessionThemeProps(theme, {
      ground: false,
      className: cn("size-6", className),
    })}
    fill="currentColor"
    {...(title ? { role: "img" } : { "aria-hidden": true })}
  >
    {title && <title>{title}</title>}
    <MochiShapes tone={tone} />
  </svg>
)
