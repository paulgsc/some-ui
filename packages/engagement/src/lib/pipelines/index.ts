import type { Pipeline, Unmeasured } from "@engagement/lib/registry"

import { CAST } from "./cast"
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
  ...CAST,
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
    route: "/asks",
    why: "What waits on the owner (docs/asks.md): a desk to decide and tick off steps at, and copy a receipt from, not an offer.",
  },
  {
    route: "/asks/$view",
    why: "One kind of ask, or every ask counted by call and by who waits, at the same desk: not an offer.",
  },
  {
    route: "/cooking",
    why: "Where the work in flight stands (LEDGER-WEB, #3425): a board read from GitHub, not an offer.",
  },
  {
    route: "/burn-ins",
    why: "A preview of what every video carries, on sample data, and the recorder's page.",
  },
  { route: "/captions", why: "The burn-ins' old address; it opens them." },
  {
    route: "/journal/takes/conveyor",
    why: "Where Studio's takes are moved along (CONVEYOR2): sorting what's kept, with nothing offered back. What a take made Ready for pickup becomes is the pickup's (CONVEYOR3).",
  },
  {
    route: "/journal/takes/attention",
    why: "The takes home couldn't hear well (HEARD3): reconciling what's kept, each heard and kept, marked to record again, or deleted through My data's delete. Nothing is offered back.",
  },
  {
    route: "/journal/renders",
    why: "What home is making and what's coming (SFEED13): a read of home's renders, with nothing to act on but the way to run one that couldn't finish again.",
  },
  {
    route: "/journal/renders/$feed/$key",
    why: "Running a render that couldn't finish again (RETRY): its steps, and a tap that sends it back in line. Nothing is offered back.",
  },
  ...[
    "/journal/spoken",
    "/journal/spoken/paste",
    "/journal/spoken/$card",
    "/journal/spoken/$card/$part",
  ].map((route) => ({
    route,
    why: "Studio's Spoken (W5): a spoken card pasted and read aloud, each take kept for an essay to play. What it offers back is measured once an essay plays the takes (WALK7).",
  })),
  {
    route: "/journal/cards/$key",
    why: "A cards essay home made (CARDS7): its video to watch, with nothing offered back.",
  },
  ...[
    "/journal",
    "/journal/clips",
    "/journal/clips/$clip",
    "/journal/episodes",
    "/journal/episodes/$feed/$key",
    "/journal/feedback",
    "/journal/feeds",
    "/journal/feeds/$feed",
    "/journal/takes",
    "/journal/takes/$kind",
    "/journal/takes/kept",
    "/journal/templates",
    "/journal/templates/$template",
    "/journal/templates/release-promo",
  ].map((route) => ({
    route,
    why: "Studio's index (SFEED1): a list or a page of what Studio keeps, a way to the rest. What each page offers is measured once the story that makes it an offer lands (a note on an episode).",
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
    route: "/rust-screen",
    why: "A Rust Rounds ticket's card as the phone draws it, for the essay's recorder to photograph (RR31): nothing on it to tap, on a week as home's render worker hands it over, or the sample week.",
  },
  {
    route: "/report",
    why: "The weekly engagement report's stage: one scene at a time, for its video and to look over, on a week's report as home's render worker hands it over, or the template's sample report.",
  },
]
