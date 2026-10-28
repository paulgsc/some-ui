/**
 * The three modes (#1966), strictest first: fixed bundles, each a whole
 * answer to how much of YouTube reaches the page. The owner picks a mode,
 * never a row of one, and no mode moves the boundary. What each row does
 * is `docs/absent-plated-heard.md` §7.
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
    core: {
      signs: "channel",
      fromMusic: "music",
      face: "none",
      undated: "held",
    },
    page: { ...STANDARD_PAGE, loading: "blank" },
  },
  standard: { core: STANDARD_RULES, page: STANDARD_PAGE },
  mix: {
    core: { ...STANDARD_RULES, face: "held", undated: "mix" },
    page: { ...STANDARD_PAGE, posts: "shown" },
  },
}
