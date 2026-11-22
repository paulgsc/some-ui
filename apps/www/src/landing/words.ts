/**
 * The landing's words (PAGES, #3401): the public site's front page, a CV for
 * whoever is sent the link. One table, so a review reads every sentence the
 * page says in one place, in the owner's first-person voice (CLAUDE.md, "Say
 * what it is"). The person's facts (name, contact, roles, dates, education)
 * are not here: they come from the résumé's own data (`render.ts`).
 *
 * A clip or a picture is a build-time asset of the Pages build (C1055): each
 * slot names its asset by key, and until that asset exists the slot draws the
 * placeholder this table describes. The show's words (its episodes and
 * scenes) are `show.ts`'s, beside the script they belong to.
 */

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
