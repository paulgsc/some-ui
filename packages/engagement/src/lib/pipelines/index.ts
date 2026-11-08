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
    route: "/call",
    why: "The weekly call's stage: one scene at a time, for its video and to look over, on the template's sample week.",
  },
]
