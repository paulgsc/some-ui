/**
 * The landing's words (PAGES, #3401): the public site's front page, a CV for
 * whoever is sent the link. One table, so a review reads every sentence the
 * page says in one place, in the owner's first-person voice (CLAUDE.md, "Say
 * what it is"). The person's facts (name, contact, roles, dates, education)
 * are not here: they come from the résumé's own data (`render.ts`).
 *
 * A clip or a picture is a build-time asset of the Pages build (C1055): each
 * slot names its asset by key, and until that asset exists the slot draws the
 * placeholder this table describes.
 */

/**
 * One project: a face of the showcase's cubes on a wide screen, a card on a
 * phone (C1113). Its title, its stack, one line, a shorter line for the
 * cube's band, and the asset it shows, a clip or a still, by key. A project
 * whose picture is a still is a member of the same type, not a new card.
 */
export type ProjectWords = {
  readonly id: "extensions" | "page-filter" | "android" | "server"
  readonly title: string
  readonly stack: string
  readonly line: string
  /** The line under the title in a cube's band, where room is short. */
  readonly short: string
  /** The asset the face shows, by key: a clip or a still. */
  readonly media: `clips/${string}.mp4` | `stills/${string}.png`
}

/** One gap card: one visual and one line on why. */
export type GapWords = {
  readonly id: "page-filter" | "cores"
  readonly title: string
  readonly line: string
  readonly visual: string
  /** What the drawn visual is, said on it. */
  readonly visualNote: string
}

/** One face of the showcase's copy block (C1113): a label, a headline, a line. */
export type CopyWords = {
  readonly kicker: string
  readonly headline: string
  readonly line: string
}

/** Everything the landing says that is not a fact from the résumé. */
export type LandingWords = {
  readonly title: string
  readonly description: string
  readonly role: string
  readonly resume: string
  readonly lede: string
  readonly photoAlt: string
  readonly projectsTitle: string
  readonly gapsTitle: string
  readonly experienceTitle: string
  readonly skillsTitle: string
  readonly educationTitle: string
  readonly independentNote: string
  readonly skills: string
  readonly footerKeeps: string
  readonly copy: ReadonlyArray<CopyWords>
  readonly projects: ReadonlyArray<ProjectWords>
  readonly gaps: ReadonlyArray<GapWords>
}

export const LANDING_WORDS: LandingWords = {
  title: "Paul Gathondu, software engineer",
  description:
    "Paul Gathondu, software engineer in Rust and TypeScript: what I built and use every day, the gaps I'm working through, experience, résumé and contact.",
  role: "Software engineer · Rust and TypeScript",
  resume: "Résumé (PDF)",
  lede: "I build web services in Rust and apps in TypeScript and React. These are my own work, public, and I use them every day.",
  photoAlt: "Paul Gathondu",
  projectsTitle: "What I built and use every day",
  gapsTitle: "Gaps I'm working through",
  experienceTitle: "Experience",
  skillsTitle: "Skills",
  educationTitle: "Education",
  independentNote:
    "The projects above, with CI that runs only what a change touches and a contract check that fails a server pull request which would break the app.",
  skills:
    "Rust, TypeScript, React, Node.js, SQL, Python, Axum, Tokio, Redis, NATS, Docker, GitHub Actions, Grafana, Prometheus, Vitest, Playwright",
  footerKeeps: "This page keeps nothing about you.",
  copy: [
    {
      kicker: "In my browser",
      headline: "Two extensions I wrote for myself.",
      line: "Suspender Ledger is signed by Mozilla. Page Filter is the one I use most.",
    },
    {
      kicker: "On my phone",
      headline: "One Android app for study, practice and the job search.",
      line: "TypeScript and React in Capacitor, with Rust compiled to WebAssembly.",
    },
    {
      kicker: "At home",
      headline: "file_host, the Rust server behind them.",
      line: "Its own Grafana dashboard tells me whether it's answering and what it turns away.",
    },
  ],
  projects: [
    {
      id: "extensions",
      title: "Suspender Ledger",
      stack: "TypeScript · Firefox and Chromium MV3",
      line: "It keeps a site awake, then suspends a tab. Signed and reviewed by Mozilla (unlisted).",
      short: "Keeps a site awake, then suspends a tab.",
      media: "clips/extensions.mp4",
    },
    {
      id: "page-filter",
      title: "Page Filter",
      stack: "TypeScript · Firefox and Chromium MV3",
      line: "The extension I use most: it darkens the pages I read at night.",
      short: "Darkens the pages I read at night.",
      media: "stills/page-filter.png",
    },
    {
      id: "android",
      title: "The Android app",
      stack: "TypeScript · React · Capacitor · Rust → WebAssembly",
      line: "Study sessions, Rust practice rounds, a job search desk and a video studio, in one app.",
      short: "Study, practice, jobs and a video studio.",
      media: "clips/apk.mp4",
    },
    {
      id: "server",
      title: "file_host: the server behind them",
      stack: "Rust · Axum · Tokio · SQLite · Redis · NATS · Grafana",
      line: "It runs on my home server, under its own dashboard: whether it's answering, how long it has been up, and what the rate limiter turns away.",
      short: "My home server, under its own dashboard.",
      media: "clips/server.mp4",
    },
  ],
  gaps: [
    {
      id: "page-filter",
      title: "Page Filter misses parts of a page",
      line: "Pages draw some parts inside their own components and keep changing after they load, so the filter can't be sure it has darkened everything.",
      visual: "stills/page-filter.png",
      visualNote: "Drawing: the page goes dark, one part stays white",
    },
    {
      id: "cores",
      title: "My home server has four CPU cores",
      line: "When work slows down, I'm measuring whether it's my code or the machine.",
      visual: "stills/cores.png",
      visualNote:
        "Drawing of my home server's CPU panel: busy and waiting, of 4 cores",
    },
  ],
}
