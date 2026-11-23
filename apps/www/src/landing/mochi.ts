/**
 * The mochi, the owner's character in the brand's cast
 * (`@some-ui/styles/brand/cast`, `characterSvg`), as one inline SVG: the
 * landing's photo slot holds it until the owner's photo is bundled (PAGES,
 * #3401). It is the very drawing the videos' thumbnails show for "+ me", so
 * the page and the videos agree on one mochi. A reader can send it a hug
 * (C1187): a heart, lucide's, drawn here as plain SVG since the page runs
 * no script, rises from it.
 */
import { createElement } from "react"
import { characterSvg } from "@some-ui/styles/brand/cast"
import { Heart } from "lucide-react"
import { renderToStaticMarkup } from "react-dom/server"

/** The mochi as an inline `<svg>`, sized by its slot. */
export function mochiSvg(): string {
  return characterSvg("mochi", 132)
    .replace(' width="132" height="132"', ' aria-hidden="true"')
    .trim()
}

/** The mochi as the landing draws it: its drawing, and the heart a hug sends. */
export type LandingMochi = { readonly svg: string; readonly heart: string }

export function landingMochi(): LandingMochi {
  return {
    svg: mochiSvg(),
    heart: renderToStaticMarkup(
      createElement(Heart, { size: 30, fill: "currentColor" })
    ),
  }
}
