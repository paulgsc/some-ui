/**
 * The mochi, the brand's mark (`@some-ui/styles/brand/mark`, `markSvg`) as
 * one inline SVG: the landing's photo slot holds it until the owner's photo
 * is bundled (PAGES, #3401). `markSvg` is the mark drawn as a file outside a
 * browser, as the videos' brand slides draw it, so the page and the code
 * agree on the one drawing.
 */
import { markSvg } from "@some-ui/styles/brand/mark"

/** The mark's honey, as the brand slides fill it. */
const HONEY = "#f2b25c"
/** The mark's face. */
const INK = "#3a2a1a"

/** The mochi as an inline `<svg>`, sized by its slot. */
export function mochiSvg(): string {
  return markSvg({ brand: HONEY, ink: INK })
    .replace(' width="64" height="64"', ' aria-hidden="true"')
    .trim()
}
