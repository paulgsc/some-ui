import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  Brain,
  Contrast,
  EyeOff,
  Fingerprint,
  Hand,
  HardDrive,
  KeyRound,
  Ruler,
  ScrollText,
  WifiOff,
} from "lucide-react"

import { ThemeSwitcher } from "@/components/theme-switcher"

/**
 * The "why" behind this workspace, as a page: "/" says *what* is deployed;
 * this says the two mandates (`CLAUDE.md`) to the viewer, then the position
 * each of four tools takes, as one claim and one mechanism, held to
 * `packages/ui/resume/resume.typ`'s rule that a premise is immediately cashed
 * out in its mechanism.
 */

type Mandate = { term: string; gloss: string }

const MANDATES: ReadonlyArray<Mandate> = [
  {
    term: "It works.",
    gloss:
      "Each tool exists because I use it: to study, to track, to make, to watch. It has to do its job in my own day first.",
  },
  {
    term: "It reads.",
    gloss:
      "Each tool is also published as it is, so anyone can see what it does and how, whatever they bring to it.",
  },
]

type Position = {
  /** Display ordinal. Not derived from the array index — it's typeset. */
  ordinal: string
  /** What it is. */
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
    claim: "A virtual-memory subsystem for the browser.",
    mechanism:
      "A browser used as an operating system holds hundreds of tabs that are long-lived workspaces. Suspension virtualizes them: memory is reclaimed while each tab keeps its strip position, its history entry and its identity. Every suspended tab stays open, so reversibility is built into the structure.",
    artifact: "suspender-ledger",
    icon: HardDrive,
  },
  {
    ordinal: "02",
    claim: "An attention firewall.",
    mechanism:
      "Every recommendation starts hidden and opens one layer at a time, when asked, through a state machine whose illegal transitions are compile errors. A search shows what was searched for, and attention goes only where it is given.",
    artifact: "some-censor",
    icon: EyeOff,
  },
  {
    ordinal: "03",
    claim: "A rendering layer for the readable web.",
    mechanism:
      "Pages render with one consistent contrast and palette, so the eye settles once. Visual comfort is a measured property of what a page actually renders, scored against a corpus of human-labeled fixtures, so a visual regression fails the build like any other bug.",
    artifact: "some-filter",
    icon: Contrast,
  },
  {
    ordinal: "04",
    claim: "An engine that estimates what a learner knows.",
    mechanism:
      "The software adapts to the learner: it infers a hidden knowledge state from every interaction and chooses the next experience that teaches the most, adapting the modality as well as the difficulty. The games are its measurement instruments.",
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
    gloss: "Whatever holds your state runs on software you own and can read.",
    icon: KeyRound,
  },
  {
    term: "Grant by intent",
    gloss:
      "Attention, memory and visibility are given on purpose, one request at a time.",
    icon: Hand,
  },
  {
    term: "Preserve identity",
    gloss:
      "Reclaiming a resource keeps the thing holding it intact: an evicted tab is still that tab.",
    icon: Fingerprint,
  },
  {
    term: "Local-first",
    gloss:
      "The work happens on hardware you own (your devices and your own server), for as long as you keep it.",
    icon: WifiOff,
  },
  {
    term: "Measure it",
    gloss:
      "Comfort, learning and reliability get metrics and labeled corpora, checked like code.",
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

/**
 * Counted from the repo: packages and extensions as
 * `packages/ui/resume/scripts/check-claims.mjs` counts them (its
 * EXPECTED_PACKAGE_COUNT and EXPECTED_EXTENSION_COUNT), canons as the
 * `docs/canon/*.typ` files.
 */
const FIGURES: ReadonlyArray<Figure> = [
  { value: "43", label: "workspace packages" },
  { value: "5", label: "browser extensions" },
  { value: "4", label: "formal canons" },
  { value: "1", label: "engineer" },
]

const PositionRow = ({
  ordinal,
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
          My working toolkit, published as I use it.
        </h1>
        <p className="text-muted-foreground mt-8 max-w-2xl text-lg leading-relaxed text-pretty md:text-xl">
          Everything here is something I use every day: how I learn Korean, how
          I browse, the football numbers I care about, what I’m building next.
          It’s a snapshot of real, live work, published as it happens.
        </p>
        <p className="text-muted-foreground/80 mt-5 max-w-2xl leading-relaxed text-pretty">
          The code is all public, and my own data stays on my home network and
          my devices. Where a tool here lets you try it, it runs on sample data,
          and nothing you do is kept.
        </p>
      </header>

      {/* ── The two mandates ───────────────────────────────────────────── */}
      <section
        aria-labelledby="mandates-heading"
        className="border-border/60 border-t py-16 md:py-20"
      >
        <h2
          id="mandates-heading"
          className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase"
        >
          Two mandates
        </h2>
        <dl className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {MANDATES.map(({ term, gloss }) => (
            <div key={term} className="space-y-3">
              <dt className="text-gradient-heading text-3xl font-bold tracking-tight md:text-4xl">
                {term}
              </dt>
              <dd className="text-muted-foreground max-w-md leading-relaxed">
                {gloss}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── The four positions ─────────────────────────────────────────── */}
      <section
        aria-labelledby="positions-heading"
        className="border-border/60 border-t pt-16 pb-8 md:pt-20"
      >
        <h2
          id="positions-heading"
          className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase"
        >
          Positions
        </h2>
        <p className="text-muted-foreground mt-6 max-w-2xl pb-6 leading-relaxed text-pretty">
          Four tools each set one default of a working day on purpose: what a
          browser keeps, what a feed shows, how a page renders, and what a
          lesson teaches next.
        </p>
        {POSITIONS.map((position) => (
          <PositionRow key={position.ordinal} {...position} />
        ))}
      </section>

      {/* ── The through-line ───────────────────────────────────────────── */}
      <section className="border-border/60 border-t py-20 md:py-28">
        <div className="border-primary/40 border-l-2 pl-6 md:pl-10">
          <p className="max-w-3xl text-2xl leading-snug font-semibold tracking-tight text-balance md:text-3xl">
            Each of these starts from a default worth changing and carries the
            change all the way into code.
          </p>
          <p className="text-muted-foreground mt-6 max-w-2xl leading-relaxed text-pretty">
            Every claim above is load-bearing somewhere in the tree: an
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
          to="/extensions"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          The extensions
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
