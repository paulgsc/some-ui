/**
 * The mark a composition draws (HYPER5, #2728): the app's own, from its code
 * (`@some-ui/styles`' `brand/mark`), in the theme the template names, never a
 * copied file. A composition that declares a `theme` variable gets the mark
 * in the theme it is given, or else in the one it declares as its default,
 * as `mark.svg` beside its `index.html`, and that theme's ground as `ground`
 * unless the cut list sets one (`withMark`, which `render.ts` calls). So a
 * released version freezes its motion, and the mark follows the code.
 */

import { markSvg } from "@some-ui/styles/brand/mark"
import type { SessionThemeId } from "@some-ui/styles/theme/registry"
import { SESSION_THEME_IDS } from "@some-ui/styles/theme/registry"
import { sessionColours } from "@some-ui/styles/theme/sources"

/** Whether `value` names one of the app's themes. */
export const isMarkTheme = (value: unknown): value is SessionThemeId =>
  SESSION_THEME_IDS.some((id) => id === value)

/** Theme `id`'s mark, as an SVG file's text, and its ground. */
export function themedMark(id: SessionThemeId): {
  readonly svg: string
  readonly ground: string
} {
  const colours = sessionColours(id, [
    "--brand",
    "--brand-foreground",
    "--background",
  ])
  const colour = (name: string): string => {
    const value = colours[name]
    if (value === undefined) throw new Error(`${id} has no ${name}`)
    return value
  }
  return {
    svg: markSvg({
      brand: colour("--brand"),
      ink: colour("--brand-foreground"),
    }),
    ground: colour("--background"),
  }
}

/** Every theme's mark and ground, as the step cache's pin reads them. */
export const everyMark = (): string =>
  SESSION_THEME_IDS.map((id) => {
    const { svg, ground } = themedMark(id)
    return `${id} ${ground}\n${svg}`
  }).join("\n")

/** The default a composition's markup declares for its `theme`, if any. */
function declaredTheme(html: string): unknown {
  const declared = /data-composition-variables='([^']*)'/.exec(html)?.[1]
  if (declared === undefined) return undefined
  const variables: unknown = JSON.parse(declared)
  if (!Array.isArray(variables)) return undefined
  for (const variable of variables) {
    if (
      typeof variable === "object" &&
      variable !== null &&
      "id" in variable &&
      variable.id === "theme"
    )
      return "default" in variable ? variable.default : undefined
  }
  return undefined
}

/**
 * The variables a composition (its `html`) is drawn with, and the mark to
 * write beside it: for one that declares a `theme`, the mark in the theme it
 * is `given`, else its declared default, with that theme's ground unless one
 * is given; for any other, `given` as it is and no mark.
 */
export function withMark(
  html: string,
  given: Readonly<Record<string, unknown>>
): {
  readonly variables: Readonly<Record<string, unknown>>
  readonly mark: string | null
} {
  const declared = declaredTheme(html)
  if (declared === undefined) return { variables: given, mark: null }
  const theme = given.theme ?? declared
  if (!isMarkTheme(theme)) return { variables: given, mark: null }
  const { svg, ground } = themedMark(theme)
  return { variables: { ground, ...given }, mark: svg }
}
