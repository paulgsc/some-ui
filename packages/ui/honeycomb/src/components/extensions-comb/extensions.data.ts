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
export type Mechanism = "tabs" | "theme" | "veil" | "cubes" | "follow" | "ride"

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
 * - `site-images`  — its card shows an image fetched from the site the item
 *                    came from (Drama Overlay: the drama's poster), so that
 *                    site sees a request from whatever page the card is on.
 *
 * One value per extension, so it names the request that says the most: an
 * extension with site images and web fonts is `site-images`.
 *
 * When an extension's network behaviour changes, change this with it.
 * `local-server` currently describes none of the six — BOYO and Conveyor only
 * reach a local server in development builds — and is kept for when one of
 * them does.
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
    // Not `ready`: the manifest ships it as "(Beta)", and it is signed on
    // AMO's unlisted channel, which has no review — so "finished, reviewed"
    // would overclaim. In daily use, which is what `testing` says.
    level: 0.8,
    stage: "testing",
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
    line: "Bright sites turn the same soft dark, so they stop glaring at you; sites already dark keep their own look.",
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
    line: "YouTube videos arrive covered; each tap uncovers a little more, and a double-click shows the picture.",
    level: 0.38,
    stage: "building",
    firefox: true,
    chrome: true,
    reach: "one-site",
    mechanism: "veil",
    // Its dev-only API client throws before any fetch in a production build
    // (api-client.ts _assertDev), so what ships requests nothing.
    network: "none",
    emblem: "covered",
  },
  {
    id: "some-conveyor",
    name: "Conveyor",
    line: "Turning cubes drift along the foot of every page, showing the time and today's progress.",
    level: 0.2,
    stage: "idea",
    firefox: true,
    chrome: true,
    reach: "everywhere",
    mechanism: "cubes",
    // effect-bus.ts can call localhost, but no face action dispatches it —
    // the only wired action opens the popup — so it requests nothing.
    network: "none",
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
    // It reads the song from YouTube, but the card it draws rides along on
    // every page you open — that is where it acts.
    reach: "everywhere",
    mechanism: "follow",
    // The card builds a thumbnail URL but never displays it, so no image is
    // fetched.
    network: "none",
    emblem: "music",
  },
  {
    // The drama never goes on stream — the reaction does. It plays in a tab
    // on a site you mark; a card on every other page (the one your stream
    // captures) shows each beat as you log it, and draws the episode's ride.
    // `everywhere`: the card rides along on any page you open.
    // `site-images`: the card shows the drama's poster, fetched from the
    // streaming site it was saved from (its popup also loads Google Fonts).
    id: "some-drama",
    name: "Drama Overlay",
    line: "One key logs how a scene hit you, and a card draws the ride, live for your stream.",
    level: 0.3,
    stage: "building",
    firefox: true,
    chrome: false,
    reach: "everywhere",
    mechanism: "ride",
    network: "site-images",
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
    "No account, and nothing you type. Its card loads a picture from the site it came from, so that site sees a request from the page the card is on.",
}

/** The first privacy atom: the tool's own network answer, in three words. */
export const NETWORK_LABEL: Readonly<Record<Network, string>> = {
  none: "no network",
  "local-server": "local server",
  "web-fonts": "google fonts",
  "site-images": "site images",
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
