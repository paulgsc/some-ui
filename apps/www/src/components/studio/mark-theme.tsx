/**
 * The theme a template's mark is drawn in, set on its page in Studio
 * (SFEED14, #2766): the mark in each of the app's themes, on that theme's
 * ground, to choose from, and the way to send the choice, a new GitHub issue
 * for a session to land (`lib/mark-theme`, `./send-issue`), as the caption
 * look is sent (`./caption-look`).
 */
import type { JSX } from "react"
import { useId, useState } from "react"
import { BrandMark } from "@some-ui/shared"
import type { SessionThemeId } from "@some-ui/styles/theme"
import { getSessionTheme } from "@some-ui/styles/theme"

import { MARK_THEMES, markIssueUrl, themeName } from "@/lib/mark-theme"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { Part } from "./layout"
import { SendIssue } from "./send-issue"

const WORDS = STUDIO_INDEX_WORDS.templates.mark

/** The control, over the theme template `template`'s mark is drawn in (`from`). */
export const MarkTheme = ({
  template,
  from,
}: {
  template: { readonly id: string; readonly title: string }
  from: SessionThemeId | undefined
}): JSX.Element => {
  const name = useId()
  /* eslint-disable owner-guard/no-mount-snapshot -- an edit buffer over the theme it edits; the page keys it by template */
  const [chosen, setChosen] = useState(from)
  /* eslint-enable owner-guard/no-mount-snapshot */
  return (
    <Part label={WORDS.label}>
      <p className="text-sm">
        {from === undefined ? WORDS.own : WORDS.named(themeName(from))}
      </p>
      <p className="text-muted-foreground text-sm">{WORDS.line}</p>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{WORDS.choose}</legend>
        {MARK_THEMES.map((id) => (
          <label
            key={id}
            className="has-[:checked]:border-brand border-border/60 flex w-24 cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-2 text-xs has-[:focus-visible]:ring-2"
          >
            <input
              type="radio"
              name={name}
              value={id}
              checked={chosen === id}
              onChange={() => setChosen(id)}
              className="sr-only"
            />
            <span
              className="grid size-16 place-items-center rounded-lg"
              style={{ backgroundColor: getSessionTheme(id)?.swatch.bg }}
            >
              <BrandMark tone="brand" theme={id} className="size-12" />
            </span>
            {themeName(id)}
          </label>
        ))}
      </fieldset>
      <SendIssue
        href={
          chosen === undefined || chosen === from
            ? null
            : markIssueUrl(template, from, chosen)
        }
        sendLine={WORDS.sendLine}
        onReset={() => setChosen(from)}
      />
    </Part>
  )
}
