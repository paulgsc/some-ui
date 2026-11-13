import type { Pipeline, Unmeasured } from "@engagement/lib/registry"

import { JOBS } from "./jobs"
import { OPERATE } from "./operate"
import { PRACTICE } from "./practice"
import { SELF } from "./self"
import { STUDIO } from "./studio"

/** Every pipeline, wing by wing. */
export const PIPELINES: ReadonlyArray<Pipeline> = [
  ...PRACTICE,
  ...SELF,
  ...STUDIO,
  ...JOBS,
  ...OPERATE,
]

/** The routes in a wing that offer nothing, each with why. */
export const UNMEASURED: ReadonlyArray<Unmeasured> = [
  {
    route: "/practice/settings",
    why: "How studying is set up: a setting, not an offer.",
  },
  {
    route: "/profile",
    why: "The level you aim at: a setting, not an offer.",
  },
  {
    route: "/rust-rounds-sample",
    why: "The viewer's sample, served on Pages alone; the owner never uses it.",
  },
  { route: "/aph/settings", why: "What aph measures against: a setting." },
  {
    route: "/home-switches",
    why: "What home does while it runs (Rust Rounds recording): a switch, not an offer.",
  },
  {
    route: "/burn-ins",
    why: "A preview of what every video carries, on sample data, and the recorder's page.",
  },
  { route: "/captions", why: "The burn-ins' old address; it opens them." },
  {
    route: "/journal/renders",
    why: "What home is making and what's coming (SFEED13): a read of home's renders, with nothing to act on.",
  },
  ...[
    "/journal",
    "/journal/asks",
    "/journal/asks/$ask",
    "/journal/clips",
    "/journal/clips/$clip",
    "/journal/episodes",
    "/journal/episodes/$feed/$key",
    "/journal/feedback",
    "/journal/feeds",
    "/journal/feeds/$feed",
    "/journal/takes",
    "/journal/takes/kept",
    "/journal/templates",
    "/journal/templates/$template",
    "/journal/templates/release-promo",
  ].map((route) => ({
    route,
    why: "Studio's index (SFEED1): a list or a page of what Studio keeps, a way to the rest. What each page offers is measured once the story that makes it an offer lands (answering an ask, a note on an episode).",
  })),
  {
    route: "/call",
    why: "The weekly call's stage: one scene at a time, for its video and to look over, on the template's sample week.",
  },
  {
    route: "/essay",
    why: "The Rust Rounds essay's stage: one scene at a time, for its video and to look over, on a week's essay as home's render worker hands it over, or the template's sample essay.",
  },
  {
    route: "/report",
    why: "The weekly engagement report's stage: one scene at a time, for its video and to look over, on a week's report as home's render worker hands it over, or the template's sample report.",
  },
]
