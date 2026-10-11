import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"

/**
 * The Some UI mark: one plump honey mochi with a face. It replaced a
 * seven-cell honeycomb whose gaps read as a cluster of holes; this is one
 * solid shape with nothing cut between its parts.
 *
 * A 64 box: a flat-top hexagon of circumradius 19 rounded by 6 (so it spans
 * 7.8 to 56.2 across, 9.55 to 54.45 down), with the face a little below
 * centre. The same strings are drawn by `apps/www/public/favicon.svg`,
 * `packages/some-styles/brand/favicon.svg` and the Android launcher layers
 * (`apps/mobile/android/app/src/main/res/drawable/ic_launcher_*.xml`), which
 * cannot import this; `apps/www/src/lib/brand/favicon.test.ts` holds them to
 * it.
 */
export const MOCHI_BODY =
  "M56.2 29A6 6 0 0 1 56.2 35L46.7 51.45A6 6 0 0 1 41.5 54.45L22.5 54.45A6 6 0 0 1 17.3 51.45L7.8 35A6 6 0 0 1 7.8 29L17.3 12.55A6 6 0 0 1 22.5 9.55L41.5 9.55A6 6 0 0 1 46.7 12.55Z"

/** Two eyes and a crescent smile, filled shapes so a one-colour mark can cut them out. */
export const MOCHI_FACE =
  "M22.9 33A2.6 2.6 0 1 0 28.1 33A2.6 2.6 0 1 0 22.9 33Z M35.9 33A2.6 2.6 0 1 0 41.1 33A2.6 2.6 0 1 0 35.9 33Z M28.5 38.4Q32 43.4 35.5 38.4Q32 40.2 28.5 38.4Z"

/** The cheeks' pink: the same on every theme, since it is drawn on the brand fill, never the page. */
const CHEEK = "#f08f7e"

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
}

export const BrandMark = ({
  className,
  tone = "current",
  title,
}: BrandMarkProps): JSX.Element => (
  <svg
    viewBox="0 0 64 64"
    className={cn("size-6", className)}
    fill="currentColor"
    {...(title ? { role: "img" } : { "aria-hidden": true })}
  >
    {title && <title>{title}</title>}
    <MochiShapes tone={tone} />
  </svg>
)
