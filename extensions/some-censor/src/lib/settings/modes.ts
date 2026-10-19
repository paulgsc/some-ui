/**
 * The three modes (#1966): fixed bundles, strictest first, each one a whole
 * answer to how much of YouTube reaches the page. The owner picks a mode,
 * never a row of one. The boundary and autoplay at a held video stand
 * outside the modes and apply in every one of them.
 *
 * | Row                     | Strict          | Standard         | Open             |
 * | ----------------------- | --------------- | ---------------- | ---------------- |
 * | Music shown whole       | channel signs   | any sign         | any sign         |
 * | Autoplay from music     | music only      | anything shown   | anything shown   |
 * | Original thumbnail      | never offered   | 3-second hold    | 3-second hold    |
 * | Channel post images     | hidden          | hidden           | shown            |
 * | Cards still loading     | blank           | blurred          | blurred          |
 *
 * Standard is what the extension did before there were modes.
 */

import type { Rules } from "@censor/lib/content/core/state"
import { STANDARD_RULES } from "@censor/lib/content/core/state"

import type { Mode } from "./settings"

/** What the stylesheet does under a mode, as `<html>` attributes. */
export type PageRules = {
  /** Images in a channel's community posts. */
  readonly posts: "hidden" | "shown"
  /** A card the content script has not read yet: blurred, or not painted. */
  readonly loading: "blurred" | "blank"
}

export type ModeRules = {
  readonly core: Rules
  readonly page: PageRules
}

const STANDARD_PAGE: PageRules = { posts: "hidden", loading: "blurred" }

export const MODE_RULES: Readonly<Record<Mode, ModeRules>> = {
  strict: {
    core: { signs: "channel", fromMusic: "music", face: false },
    page: { posts: "hidden", loading: "blank" },
  },
  standard: { core: STANDARD_RULES, page: STANDARD_PAGE },
  open: {
    core: STANDARD_RULES,
    page: { posts: "shown", loading: "blurred" },
  },
}
