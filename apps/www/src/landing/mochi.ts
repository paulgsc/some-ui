/**
 * The mochi, the owner's character in the brand's cast
 * (`@some-ui/styles/brand/cast`, `characterSvg`), as one inline SVG: the
 * landing's photo slot holds it until the owner's photo is bundled (PAGES,
 * #3401). It is the very drawing the videos' thumbnails show for "+ me", so
 * the page and the videos agree on one mochi.
 */
import { characterSvg } from "@some-ui/styles/brand/cast"

/** The mochi as an inline `<svg>`, sized by its slot. */
export function mochiSvg(): string {
  return characterSvg("mochi", 132)
    .replace(' width="132" height="132"', ' aria-hidden="true"')
    .trim()
}
