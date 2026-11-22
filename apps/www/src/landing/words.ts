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

/** One project card: what it is, its stack, and where to read it. */
export type ProjectWords = {
  readonly id: "extensions" | "android" | "server"
  readonly title: string
  readonly stack: string
  readonly line: string
  /** The clip the slot will hold, by asset key. */
  readonly clip: string
  readonly links: ReadonlyArray<{
    readonly label: string
    readonly href: string
  }>
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
  readonly footerSource: string
  readonly sourceHref: string
  readonly projects: ReadonlyArray<ProjectWords>
  readonly gaps: ReadonlyArray<GapWords>
}

const SOURCE = "https://github.com/paulgsc"

export const LANDING_WORDS: LandingWords = {
  title: "Paul Gathondu, software engineer",
  description:
    "Paul Gathondu, software engineer in Rust and TypeScript: what I built and use every day, the gaps I'm working through, experience, résumé and contact.",
  role: "Software engineer · Rust and TypeScript",
  resume: "Résumé (PDF)",
  lede: "I build web services in Rust and apps in TypeScript and React. These three are my own work, public, and I use them every day.",
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
  footerSource: "Source",
  sourceHref: `${SOURCE}/some-ui`,
  projects: [
    {
      id: "extensions",
      title: "Browser extensions",
      stack: "TypeScript · Firefox and Chromium MV3",
      line: "Suspender Ledger keeps a site awake, then suspends a tab. Signed and reviewed by Mozilla (unlisted).",
      clip: "clips/extensions.mp4",
      links: [
        {
          label: "Suspender Ledger's source",
          href: `${SOURCE}/some-ui/tree/main/extensions/suspender-ledger`,
        },
        {
          label: "All five extensions",
          href: `${SOURCE}/some-ui/tree/main/extensions`,
        },
      ],
    },
    {
      id: "android",
      title: "The Android app",
      stack: "TypeScript · React · Capacitor · Rust → WebAssembly",
      line: "Study sessions, Rust practice rounds, a job search desk and a video studio, in one app.",
      clip: "clips/apk.mp4",
      links: [
        { label: "Source", href: `${SOURCE}/some-ui/tree/main/apps/mobile` },
      ],
    },
    {
      id: "server",
      title: "file_host: the server behind them",
      stack: "Rust · Axum · Tokio · SQLite · Redis · NATS · Grafana",
      line: "It runs at home, under its own dashboard: whether it's answering, how long it has been up, and what the rate limiter turns away.",
      clip: "clips/server.mp4",
      links: [{ label: "Source", href: `${SOURCE}/server` }],
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
      title: "Home has four CPU cores",
      line: "When work slows down, I'm measuring whether it's my code or the machine.",
      visual: "stills/cores.png",
      visualNote: "Drawing of home's CPU panel: busy and waiting, of 4 cores",
    },
  ],
}
