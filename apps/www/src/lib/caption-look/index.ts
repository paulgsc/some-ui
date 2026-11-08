/**
 * A template's caption look, set in Studio (SFEED11, #2707; ask #2708,
 * option 1): what the control can change of a `@some-ui/burn-ins` look, and
 * the issue that sends the changed look to a session, which lands it as a
 * new pinned look in the code. Nothing the phone saves draws a video; the
 * next render after that session merges does. Pure.
 */
import type { CaptionTheme, ThemeId } from "@some-ui/burn-ins/contract"
import { THEME_IDS, THEMES } from "@some-ui/burn-ins/contract"

/** What the control sets. */
export type LookEdit = {
  readonly weight: CaptionTheme["font"]["weight"]
  readonly sizePx: number
  readonly text: string
  readonly highlight: string
  readonly stroke: string
  readonly strokePx: number
  /** The plate behind the words: its colour and opacity, or none. */
  readonly plate: { readonly colour: string; readonly opacity: number } | null
  /** Light the word being said. */
  readonly lit: boolean
  readonly popInMs: number
}

/** Each number's range and step, in the look's own units. */
export const LOOK_RANGES = {
  sizePx: { min: 48, max: 110, step: 2 },
  strokePx: { min: 0, max: 16, step: 1 },
  opacity: { min: 0.4, max: 1, step: 0.02 },
  popInMs: { min: 0, max: 400, step: 20 },
} as const

/** The look `id` names, or `null` for one `@some-ui/burn-ins` doesn't have. */
export const lookNamed = (id: string | null): CaptionTheme | null => {
  const named = THEME_IDS.find((each) => each === id)
  return named === undefined ? null : THEMES[named]
}

export const editOf = (look: CaptionTheme): LookEdit => ({
  weight: look.font.weight,
  sizePx: look.font.sizePx,
  text: look.colours.text,
  highlight: look.colours.highlight,
  stroke: look.colours.stroke,
  strokePx: look.strokePx,
  plate:
    look.plate === null
      ? null
      : { colour: look.plate.colour, opacity: look.plate.opacity },
  lit: look.effects.highlight,
  popInMs: look.effects.popInMs,
})

/** A plate's shape when the control adds one to a look without it. */
const PLATE_SHAPE = { radiusPx: 18, padXPx: 28, padYPx: 16 } as const

/** `look` with `edit` applied: what a session would pin. */
export const withEdit = (look: CaptionTheme, edit: LookEdit): CaptionTheme => ({
  ...look,
  font: { ...look.font, weight: edit.weight, sizePx: edit.sizePx },
  colours: { text: edit.text, highlight: edit.highlight, stroke: edit.stroke },
  strokePx: edit.strokePx,
  plate:
    edit.plate === null
      ? null
      : { ...(look.plate ?? PLATE_SHAPE), ...edit.plate },
  effects: { highlight: edit.lit, popInMs: edit.popInMs },
})

export const sameLook = (a: CaptionTheme, b: CaptionTheme): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

const NEW_ISSUE = "https://github.com/paulgsc/some-ui/issues/new"

/**
 * The GitHub page that files the changed look for a session to land: a new
 * issue in this repository, its body naming the template and the look it
 * changes and carrying the look whole in one ```` ```json caption-look ````
 * block. The owner files it there; nothing is sent until then.
 */
export function lookIssueUrl(
  template: { readonly id: string; readonly title: string },
  from: ThemeId,
  look: CaptionTheme
): string {
  const body = [
    `A caption look set in Studio for ${template.title} (\`${template.id}\`), changed from the \`${from}\` look.`,
    "",
    "Land it as a new look in `@some-ui/burn-ins` (`THEMES`) and a new version of the series that names it, so videos already made keep the look they were drawn in (SFEED11, #2707).",
    "",
    "```json caption-look",
    JSON.stringify(look, null, 2),
    "```",
  ].join("\n")
  const url = new URL(NEW_ISSUE)
  url.searchParams.set("title", `Caption look for ${template.title}`)
  url.searchParams.set("body", body)
  url.searchParams.set("labels", "story,kind:story")
  return url.toString()
}
