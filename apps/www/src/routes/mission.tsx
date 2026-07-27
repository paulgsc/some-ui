import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  Ban,
  Brain,
  Contrast,
  EyeOff,
  Fingerprint,
  HardDrive,
  KeyRound,
  Ruler,
  ScrollText,
  WifiOff,
} from "lucide-react"

import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The "why" behind this workspace, as a page rather than a document.
 *
 * "/" answers *what* is deployed here (an app, a Storybook, a résumé) and
 * sends you to it. Nothing answered why any of it exists — and the projects
 * in this repo are not features, they are positions: a browser is an
 * operating system, exposure should be opt-in, visual comfort is measurable,
 * a curriculum should adapt to the learner. Those positions are the actual
 * through-line, and they were previously only legible to someone willing to
 * read four separate READMEs and three canons.
 *
 * Deliberately not a journal or a blog: no dates, no narrative, no posts.
 * Each position is one refusal, one claim, and one mechanism, stated at a
 * size you can read across a room. The rule the copy is held to is the same
 * one `packages/ui/resume/resume.typ` follows — a premise earns its place
 * only if it is immediately cashed out in the mechanism implementing it.
 */

type Position = {
  /** Display ordinal. Not derived from the array index — it's typeset. */
  ordinal: string
  /** The thing this project is constantly mistaken for. */
  foil: string
  /** What it actually is. */
  claim: string
  /** How the claim is made true in code — the part that keeps this honest. */
  mechanism: string
  /** Where it lives in this workspace. */
  artifact: string
  icon: typeof HardDrive
}

const POSITIONS: ReadonlyArray<Position> = [
  {
    ordinal: "01",
    foil: "Not another tab suspender.",
    claim: "A virtual-memory subsystem for the browser.",
    mechanism:
      "A browser used as an operating system holds hundreds of tabs that are long-lived workspaces, not pages. So suspension is virtualization, not cleanup: memory is reclaimed while the tab keeps its strip position, its history entry, and its identity. There is no code path that closes a tab — reversibility is structural, not intended.",
    artifact: "suspender-ledger",
    icon: HardDrive,
  },
  {
    ordinal: "02",
    foil: "Not an ad blocker.",
    claim: "An attention firewall.",
    mechanism:
      "Recommendation surfaces are engineered to maximize exposure. Inverting that means nothing earns attention by default — every recommendation begins hidden and surrenders exactly one layer at a time, through a state machine whose illegal transitions are compile errors. Searching for something should never require being exposed to everything around it.",
    artifact: "some-censor",
    icon: EyeOff,
  },
  {
    ordinal: "03",
    foil: "Not a dark mode.",
    claim: "A rendering layer for the readable web.",
    mechanism:
      "Every site ships its own contrast and palette, forcing the eye to re-adapt on each navigation. Visual comfort is treated as a measurable property of what a page actually renders, scored against a corpus of human-labeled fixtures — so a visual regression is something you can fail a build on, not something you argue about.",
    artifact: "some-filter",
    icon: Contrast,
  },
  {
    ordinal: "04",
    foil: "Not educational games.",
    claim: "An engine that estimates what a learner knows.",
    mechanism:
      "Fixed curricula make the learner adapt to the software. Inverting that makes the software responsible for inferring a hidden knowledge state from every interaction and choosing the next experience that teaches the most — adapting the modality, not just the difficulty. The games are not the product; they are the measurement instruments.",
    artifact: "hangul-game-core · honeycomb",
    icon: Brain,
  },
]

type Principle = {
  term: string
  gloss: string
  icon: typeof HardDrive
}

const PRINCIPLES: ReadonlyArray<Principle> = [
  {
    term: "Own the critical path",
    gloss:
      "Anything load-bearing enough to lose your state is too important to rent from a closed-source vendor.",
    icon: KeyRound,
  },
  {
    term: "Default deny",
    gloss:
      "Nothing earns attention, memory, or visibility automatically. Access is granted by intent.",
    icon: Ban,
  },
  {
    term: "Preserve identity",
    gloss:
      "Reclaiming a resource must never destroy the thing holding it. Eviction is not deletion.",
    icon: Fingerprint,
  },
  {
    term: "Local-first",
    gloss:
      "The work happens on the client, under the user's control, with no service to depend on or outlive.",
    icon: WifiOff,
  },
  {
    term: "Measure, don't assert",
    gloss:
      "Comfort, learning, and reliability get metrics and labeled corpora — not opinions in a review thread.",
    icon: Ruler,
  },
  {
    term: "Derive before you code",
    gloss:
      "Hard subsystems are proved in a canon of definitions and theorems first; modules cite it or the diff is incomplete.",
    icon: ScrollText,
  },
]

type Figure = { value: string; label: string }

const FIGURES: ReadonlyArray<Figure> = [
  { value: "58", label: "workspace packages" },
  { value: "12", label: "browser extensions" },
  { value: "3", label: "formal canons" },
  { value: "1", label: "engineer" },
]

const PositionRow = ({
  ordinal,
  foil,
  claim,
  mechanism,
  artifact,
  icon: Icon,
}: Position): JSX.Element => (
  <article className="border-border/60 grid gap-x-8 gap-y-5 border-t py-12 md:grid-cols-[7rem_1fr] md:py-16">
    <div className="flex items-start gap-4 md:flex-col md:gap-5">
      <span className="text-muted-foreground/35 font-mono text-5xl leading-none font-bold tabular-nums md:text-6xl">
        {ordinal}
      </span>
      <span className="border-border/70 bg-surface/60 flex size-11 shrink-0 items-center justify-center rounded-full border">
        <Icon className="text-muted-foreground size-5" aria-hidden />
      </span>
    </div>

    <div className="space-y-5">
      <p className="text-muted-foreground/70 text-base font-medium line-through decoration-1 md:text-lg">
        {foil}
      </p>
      <h3 className="text-gradient-heading max-w-3xl text-3xl leading-[1.1] font-bold tracking-tight text-balance md:text-5xl">
        {claim}
      </h3>
      <p className="text-muted-foreground max-w-2xl leading-relaxed">
        {mechanism}
      </p>
      <p className="text-muted-foreground/80 pt-1 font-mono text-xs tracking-wide">
        {artifact}
      </p>
    </div>
  </article>
)

const Mission = (): JSX.Element => (
  <main className="bg-background text-foreground min-h-svh">
    {/* Fixed chrome: the page is a long read, so the way back and the theme
        control stay reachable without scrolling to a header. */}
    <div className="fixed inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 md:px-8">
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground bg-background/70 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm backdrop-blur transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back
      </Link>
      <ThemeSwitcher />
    </div>

    <div className="mx-auto max-w-5xl px-5 md:px-8">
      {/* ── Thesis ─────────────────────────────────────────────────────── */}
      <header className="flex min-h-svh flex-col justify-center py-24">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
          Some UI — Mission
        </p>
        <h1 className="text-gradient-heading mt-6 text-5xl leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl md:text-7xl">
          Own the software you depend on.
        </h1>
        <p className="text-muted-foreground mt-8 max-w-2xl text-lg leading-relaxed text-pretty md:text-xl">
          The tools that mediate a working day — the browser holding your state,
          the feed spending your attention, the surface straining your eyes, the
          software claiming to teach you — arrive with defaults chosen by
          someone else. Every one of those defaults is reversible.
        </p>
        <p className="text-muted-foreground/80 mt-5 max-w-2xl leading-relaxed text-pretty">
          This workspace is four such reversals, built and operated as
          production software rather than as arguments.
        </p>
      </header>

      {/* ── The four positions ─────────────────────────────────────────── */}
      <section aria-labelledby="positions-heading" className="pb-8">
        <h2
          id="positions-heading"
          className="text-muted-foreground pb-2 text-xs font-medium tracking-[0.2em] uppercase"
        >
          Positions
        </h2>
        {POSITIONS.map((position) => (
          <PositionRow key={position.ordinal} {...position} />
        ))}
      </section>

      {/* ── The through-line ───────────────────────────────────────────── */}
      <section className="border-border/60 border-t py-20 md:py-28">
        <div className="border-primary/40 border-l-2 pl-6 md:pl-10">
          <p className="max-w-3xl text-2xl leading-snug font-semibold tracking-tight text-balance md:text-3xl">
            Each of these begins by refusing a default, and none of them stops
            there.
          </p>
          <p className="text-muted-foreground mt-6 max-w-2xl leading-relaxed text-pretty">
            A position that cannot be cashed out in a mechanism is just taste.
            So every claim above is load-bearing somewhere in the tree: an
            invariant that makes the bad state unconstructible, a type that
            turns a mistake into a compile error, a corpus that turns a
            preference into a test.
          </p>
        </div>
      </section>

      {/* ── Principles ─────────────────────────────────────────────────── */}
      <section
        aria-labelledby="principles-heading"
        className="border-border/60 border-t py-16 md:py-20"
      >
        <h2
          id="principles-heading"
          className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase"
        >
          Principles
        </h2>
        <dl className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map(({ term, gloss, icon: Icon }) => (
            <div key={term} className="space-y-3">
              <Icon className="text-primary/70 size-5" aria-hidden />
              <dt className="font-semibold tracking-tight">{term}</dt>
              <dd className="text-muted-foreground text-sm leading-relaxed">
                {gloss}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Scale ──────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="scale-heading"
        className="border-border/60 border-t py-16 md:py-20"
      >
        <h2
          id="scale-heading"
          className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase"
        >
          One workspace
        </h2>
        <dl className="mt-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
          {FIGURES.map(({ value, label }) => (
            <div key={label}>
              <dt className="sr-only">{label}</dt>
              <dd>
                <span className="text-gradient-accent block text-4xl font-bold tabular-nums md:text-5xl">
                  {value}
                </span>
                <span className="text-muted-foreground mt-2 block text-sm">
                  {label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-10 max-w-2xl text-sm leading-relaxed text-pretty">
          TypeScript and Rust in a single monorepo, behind one merge gate that
          scopes its work to what actually changed — and one release path that
          versions, builds, and signs everything above.
        </p>
      </section>

      {/* ── Onward ─────────────────────────────────────────────────────── */}
      <section className="border-border/60 flex flex-wrap gap-x-8 gap-y-3 border-t py-14 text-sm">
        <Link
          to="/app"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Open the app
        </Link>
        <Link
          to="/resume"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Résumé
        </Link>
        <a
          href="https://github.com/paulgsc/some-ui"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Source on GitHub
        </a>
      </section>
    </div>
  </main>
)

export const Route = createFileRoute("/mission")({
  component: Mission,
})
