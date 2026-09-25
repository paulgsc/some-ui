/**
 * Every string and every quantity the /extensions comb is allowed to show.
 *
 * The comb's design law is that prose is disclosed by interaction, never
 * rendered eagerly — so the text budget is finite and lives here, on purpose.
 * Adding a string to the page means adding it to this file deliberately.
 *
 * Static and hand-authored. `level` and `stage` are *claims about maturity*,
 * not metrics derived from the repo: they are what this workspace is willing
 * to tell a stranger about how finished a thing is. Deriving them from
 * manifests or test counts would make them precise and wrong.
 *
 * Copy rules: second person, present tense, no jargon, no apology for
 * unfinished work — say what the tool does for you, not how it is built.
 * `line` is set as page type in the caption under the comb, where three lines
 * on a phone is the budget. Keep it under ~95 characters.
 */

/** How finished a thing is, as a visitor would say it. */
export type Stage = "idea" | "building" | "testing" | "ready"

export const STAGE_ORDER: ReadonlyArray<Stage> = [
  "idea",
  "building",
  "testing",
  "ready",
]

export const STAGE_LABEL: Readonly<Record<Stage, string>> = {
  idea: "Idea",
  building: "Building",
  testing: "Testing",
  ready: "Ready",
}

/** The caption at L2 · stage. One per step, not one per extension. */
export const STAGE_LINE: Readonly<Record<Stage, string>> = {
  idea: "On the bench. It runs, and it is clearly not finished.",
  building: "Being built. The idea is proven; the edges are not.",
  testing: "In testing. In daily use while the last rough parts get fixed.",
  ready: "Ready. Finished, reviewed, and installable today.",
}

/** Which miniature plays in the L1 top register. One per extension, no text. */
export type Mechanism = "tabs" | "theme" | "veil" | "cubes" | "bars" | "pulse"

/** Where the extension acts: one named site, or the whole web. */
export type Reach = "one-site" | "everywhere"

/**
 * What an extension sends over the network, which is the answer the privacy
 * facet gives. Read off each extension's source, not assumed: the six do not
 * share one answer, and a page that told a stranger "talks to no server" about
 * a popup that fetches Google Fonts would be making a false privacy claim.
 *
 * - `none`         — no request at all.
 * - `local-server` — only to a server the user runs on their own machine
 *                    (`localhost`), which is where it keeps its data.
 * - `web-fonts`    — its popup fetches typefaces from Google Fonts. Nothing
 *                    about the user or their pages goes with it.
 * - `site-images`  — it shows images from the one site it works on, fetched
 *                    from that site's image server.
 *
 * When an extension's network behaviour changes, change this with it.
 */
export type Network = "none" | "local-server" | "web-fonts" | "site-images"

/**
 * Which glyph a ring cell carries at L0. Named by role rather than by lucide
 * component so this file stays a content manifest with no React in it — the
 * comb owns the mapping to actual icons.
 */
export type Emblem =
  | "memory"
  | "contrast"
  | "covered"
  | "belt"
  | "music"
  | "beat"

export type ExtensionDefinition = {
  /** Stable key. Matches the workspace under extensions/, but is never shown. */
  readonly id: string
  /** Shown in the centroid at L1, on hover at L0, and in the cell on touch. */
  readonly name: string
  /** The one sentence. The caption is the only place it may appear. */
  readonly line: string
  /**
   * Honey fill, 0..1. Authored. Carried unchanged from L0 into L1 — a viewer
   * learns the fill is a quantity by seeing the same value survive the
   * transition, so never re-round or re-derive it between levels.
   */
  readonly level: number
  readonly stage: Stage
  readonly firefox: boolean
  readonly chrome: boolean
  readonly reach: Reach
  readonly mechanism: Mechanism
  readonly emblem: Emblem
  readonly network: Network
}

export const EXTENSIONS: ReadonlyArray<ExtensionDefinition> = [
  {
    id: "suspender-ledger",
    name: "Suspender Ledger",
    line: "Idle tabs go quiet and give their memory back. Click one and it is there again.",
    level: 1.0,
    stage: "ready",
    firefox: true,
    chrome: false,
    reach: "everywhere",
    mechanism: "tabs",
    network: "none",
    emblem: "memory",
  },
  {
    id: "some-filter",
    name: "Page Filter",
    line: "One calm palette on every site you open, instead of a different glare on each.",
    level: 0.5,
    stage: "testing",
    firefox: true,
    chrome: true,
    reach: "everywhere",
    mechanism: "theme",
    network: "web-fonts",
    emblem: "contrast",
  },
  {
    id: "some-censor",
    name: "BOYO",
    line: "Recommendations arrive covered. You lift the cover a step at a time.",
    level: 0.38,
    stage: "building",
    firefox: true,
    chrome: true,
    reach: "one-site",
    mechanism: "veil",
    network: "local-server",
    emblem: "covered",
  },
  {
    id: "some-conveyor",
    name: "Conveyor",
    line: "A slow strip of turning cubes carries what you asked to be reminded of.",
    level: 0.2,
    stage: "idea",
    firefox: true,
    chrome: true,
    reach: "everywhere",
    mechanism: "cubes",
    network: "local-server",
    emblem: "belt",
  },
  {
    id: "some-mujik",
    name: "Music Overlay",
    line: "The music stays in a tab you are not watching; a card follows you to the one you are.",
    level: 0.18,
    stage: "idea",
    firefox: true,
    chrome: false,
    reach: "one-site",
    mechanism: "bars",
    network: "site-images",
    emblem: "music",
  },
  {
    id: "some-drama",
    name: "Drama Tracker",
    line: "One tap says how a moment felt, stamped to the exact second of the episode.",
    level: 0.14,
    stage: "idea",
    firefox: true,
    chrome: false,
    reach: "one-site",
    mechanism: "pulse",
    network: "web-fonts",
    emblem: "beat",
  },
]

/**
 * The L2 · privacy facet's caption, one per kind of network use. Each says
 * first what the visitor cares about (does anything about *them* leave) and
 * then, plainly, what request the tool does make.
 */
export const PRIVACY_LINE: Readonly<Record<Network, string>> = {
  none: "Nothing. It runs on your machine, talks to no server, and you never make an account.",
  "local-server":
    "Nothing leaves your machine. It keeps its data in a small server you run yourself, and there is no account.",
  "web-fonts":
    "Nothing about you or your pages. Its popup does load its typefaces from Google Fonts, and there is no account.",
  "site-images":
    "Nothing about you. Its card loads the video's thumbnail from YouTube's image server, and there is no account.",
}

/** The first privacy atom: the tool's own network answer, in three words. */
export const NETWORK_LABEL: Readonly<Record<Network, string>> = {
  none: "no network",
  "local-server": "local server",
  "web-fonts": "google fonts",
  "site-images": "youtube images",
}

/** The privacy atoms every one of the six shares. */
export const PRIVACY_ATOMS: ReadonlyArray<{
  readonly id: string
  readonly label: string
}> = [
  { id: "no-account", label: "no sign-in" },
  { id: "open-source", label: "source is public" },
]

/** Fixed micro-labels. Three words maximum, or it belongs in the caption. */
export const LABEL = {
  runsIn: "runs in",
  reach: "where it acts",
  privacy: "what it sends",
  up: "all six",
  back: "back",
  cue: "pick a cell",
} as const

/**
 * The document's heading. It is rendered visually hidden, so it is a label
 * rather than copy: the comb is the page, and at rest a visitor reads nothing
 * they did not ask for by touching a cell. It exists because a screen reader
 * has no comb to look at and a document with no heading gives it nothing to
 * announce or navigate by.
 *
 * It was "The comb" through design, which names the shape and makes no claim,
 * and then "Six tools that stay on your machine" — a privacy claim the six do
 * not all meet (see `Network`). It names what the page is instead.
 */
export const PAGE_TITLE = "Six small tools for your browser"
