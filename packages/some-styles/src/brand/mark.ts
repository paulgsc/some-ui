/**
 * The Some UI mark's geometry and its drawing outside a browser: one plump
 * honey mochi with a face, one solid shape with nothing cut between its
 * parts. A 64 box: a flat-top hexagon of circumradius 19 rounded by 6, with
 * the face a little below centre.
 *
 * `@some-ui/shared`'s `MochiShapes` draws these paths in the page's theme;
 * `markSvg` draws the same shapes, in the same order, as a file in given
 * colours, for a video's brand slides (HYPER5, #2728), so the mark follows
 * the code wherever it is drawn. `apps/www/public/favicon.svg`,
 * `brand/favicon.svg` and the Android launcher layers carry their own copies,
 * which `apps/www/src/lib/brand/favicon.test.ts` holds to these.
 */

export const MOCHI_BODY =
  "M56.2 29A6 6 0 0 1 56.2 35L46.7 51.45A6 6 0 0 1 41.5 54.45L22.5 54.45A6 6 0 0 1 17.3 51.45L7.8 35A6 6 0 0 1 7.8 29L17.3 12.55A6 6 0 0 1 22.5 9.55L41.5 9.55A6 6 0 0 1 46.7 12.55Z"

/** Two eyes and a crescent smile, filled shapes so a one-colour mark can cut them out. */
export const MOCHI_FACE =
  "M22.9 33A2.6 2.6 0 1 0 28.1 33A2.6 2.6 0 1 0 22.9 33Z M35.9 33A2.6 2.6 0 1 0 41.1 33A2.6 2.6 0 1 0 35.9 33Z M28.5 38.4Q32 43.4 35.5 38.4Q32 40.2 28.5 38.4Z"

/** The cheeks' pink: the same on every theme, since it is drawn on the brand fill, never the page. */
export const MOCHI_CHEEK = "#f08f7e"

/** The mark's two colours: its fill (`--brand`) and its ink (`--brand-foreground`). */
export type MarkColours = { readonly brand: string; readonly ink: string }

/** The mark as an SVG file's text, in `colours`, on a transparent ground. */
export const markSvg = ({ brand, ink }: MarkColours): string =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">`,
    `<path d="${MOCHI_BODY}" style="fill:${brand}"/>`,
    `<ellipse cx="21" cy="19.5" rx="5.5" ry="3" transform="rotate(-32 21 19.5)" style="fill:color-mix(in oklab, white 60%, ${brand})"/>`,
    `<ellipse cx="19.5" cy="38.5" rx="3.4" ry="2.2" fill="${MOCHI_CHEEK}" opacity="0.7"/>`,
    `<ellipse cx="44.5" cy="38.5" rx="3.4" ry="2.2" fill="${MOCHI_CHEEK}" opacity="0.7"/>`,
    `<path d="${MOCHI_FACE}" style="fill:${ink}"/>`,
    `</svg>`,
    "",
  ].join("\n")
