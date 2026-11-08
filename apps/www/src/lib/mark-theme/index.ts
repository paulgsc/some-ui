/**
 * The theme a template's mark is drawn in, set in Studio (SFEED14, #2766;
 * ask #2674): the brand intro and outro draw the app's mark from code, in
 * whichever of the app's themes the template's shape names
 * (`brand.theme`, `markThemeOf`). A change goes to a session as a new issue
 * holding the theme in one ```` ```json mark-theme ```` block, which it
 * lands as a new pinned version of the template, as a caption look is
 * (`lib/caption-look`). Nothing the phone saves draws a video. Pure.
 */
import type { SessionThemeId } from "@some-ui/styles/theme"
import { getSessionTheme, SESSION_THEME_IDS } from "@some-ui/styles/theme"

import { templateIssueUrl } from "@/lib/template-issue"

/** Every theme a mark can be drawn in: each of the app's. */
export const MARK_THEMES: ReadonlyArray<SessionThemeId> = SESSION_THEME_IDS

/** Theme `id`'s name, as the app's theme switcher says it. */
export const themeName = (id: SessionThemeId): string =>
  getSessionTheme(id)?.label ?? id

/**
 * The GitHub page that files the mark's new theme for a session to land: a
 * new issue in this repository naming the template, the theme it is drawn
 * in now (`from`, absent for the app's own) and the one chosen.
 */
export function markIssueUrl(
  template: { readonly id: string; readonly title: string },
  from: SessionThemeId | undefined,
  to: SessionThemeId
): string {
  const was =
    from === undefined
      ? "the app's own theme"
      : `${themeName(from)} (\`${from}\`)`
  return templateIssueUrl(`The mark's theme for ${template.title}`, [
    `The mark on ${template.title}'s brand intro and outro (\`${template.id}\`), set in Studio to ${themeName(to)} (\`${to}\`), changed from ${was}.`,
    "",
    "Land it as a new version of the template whose shape's `brand.theme` names it, so videos already made keep the mark they were drawn in (`packages/video-render/README.md`, \"A mark's theme sent from Studio\"; SFEED14, #2766).",
    "",
    "```json mark-theme",
    JSON.stringify({ brand: { theme: to } }, null, 2),
    "```",
  ])
}
