/**
 * rustc's recorded result for a program, as home's rust-runner recorded it
 * (RR3): on a card (`../rust-rounds`) and on a week's ticket
 * (`../rust-week`). Its words are the cards' (`lib/play/words`), and
 * `silent` says a program that compiled with nothing from rustc, where a
 * screen says so.
 *
 * A compile error is laid out as the owner's call C650 says (RR23);
 * `lib/rustc-view` decides what is shown.
 */
import type { JSX, ReactNode } from "react"
import type { Diagnostic, RustcRun } from "@rust-rounds/lib/formats"
import { runHeading, WORDS } from "@rust-rounds/lib/play/words"
import type {
  ChildView,
  DiagnosticView,
  Mark,
  PrintedTone,
} from "@rust-rounds/lib/rustc-view"
import {
  diagnosticView,
  isWhole,
  printedLines,
  RUSTC_GLYPHS,
  tickedRuns,
  toneOfLevel,
} from "@rust-rounds/lib/rustc-view"
import { cn } from "@some-ui/core-utils"
import { CodeCard, codeSurface } from "@some-ui/shared"
import type { Appearance } from "@some-ui/styles/theme"

/** Printed text under its label. */
const Labelled = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}): JSX.Element => (
  <section className="flex min-w-0 flex-col gap-1">
    <h3 className="text-muted-foreground text-xs font-semibold">{label}</h3>
    {children}
  </section>
)

/** The program's output: kept whole, never wrapped, scrolled sideways. */
const Printed = ({
  label,
  text,
}: {
  label: string
  text: string
}): JSX.Element => (
  <Labelled label={label}>
    <pre
      data-scroll-intent="code-display"
      className="bg-muted/40 m-0 min-w-0 overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre"
    >
      {text}
    </pre>
  </Labelled>
)

/** A terminal's colours, in the semantic tokens (the `code` appearance's, on the cards). */
const PRINTED_TONE: Readonly<Record<PrintedTone, string | undefined>> = {
  error: "font-bold text-destructive",
  warning: "font-bold text-accent",
  note: "font-bold text-accent",
  help: "font-bold text-primary",
  heading: "font-bold",
  gutter: "text-muted-foreground",
  primary: "text-destructive",
  secondary: "text-primary",
  suggestion: "text-primary",
  dim: "text-muted-foreground",
  plain: undefined,
}

/** The colour of a level's word (`error`, `note:`), as rustc colours it. */
const levelClass = (level: string): string | undefined =>
  PRINTED_TONE[toneOfLevel(level)]

/** rustc's printout exactly as printed, coloured as a terminal colours it. */
const Printout = ({
  text,
  appearance,
}: {
  text: string
  appearance: Appearance
}): JSX.Element => (
  <figure className={cn(codeSurface(appearance), "overflow-hidden")}>
    <pre
      data-scroll-intent="code-display"
      className="m-0 overflow-x-auto p-3 text-xs leading-relaxed whitespace-pre"
    >
      {printedLines(text).map((runs, line) => (
        // The printout is fixed text: a line's place is its identity.
        // eslint-disable-next-line react/no-array-index-key
        <span key={line}>
          {line > 0 && "\n"}
          {runs.map((run, at) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={at} className={PRINTED_TONE[run.tone]}>
              {run.text}
            </span>
          ))}
        </span>
      ))}
    </pre>
  </figure>
)

/** rustc's words, its backticked names in the code colour, ticks kept. */
const Said = ({ text }: { text: string }): JSX.Element => (
  <>
    {tickedRuns(text).map((run, at) =>
      run.ticked ? (
        // eslint-disable-next-line react/no-array-index-key
        <span key={at} className="text-accent">
          {run.text}
        </span>
      ) : (
        run.text
      )
    )}
  </>
)

/** A line that wraps under itself, indented past its first word. */
const Line = ({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}): JSX.Element => (
  <p
    className={cn(
      "m-0 pl-[2ch] [overflow-wrap:anywhere] [text-indent:-2ch]",
      className
    )}
  >
    {children}
  </p>
)

const Location = ({ location }: { location: string }): JSX.Element => (
  <Line className="text-muted-foreground">
    {RUSTC_GLYPHS.arrow} {location}
  </Line>
)

/** Each labelled span by its line: `9 | ^ label`, or `-` for a secondary one. */
const Marks = ({ marks }: { marks: ReadonlyArray<Mark> }): JSX.Element => (
  <>
    {marks.map((mark, at) => {
      const tone = PRINTED_TONE[mark.primary ? "primary" : "secondary"]
      return (
        // eslint-disable-next-line react/no-array-index-key
        <div key={at} data-rustc-mark="" className="flex min-w-0 flex-col">
          {mark.at.kind === "elsewhere" && (
            <Location location={mark.at.location} />
          )}
          <div className="grid min-w-0 grid-cols-[auto_auto_1fr] items-baseline gap-x-[1ch]">
            <span className="text-muted-foreground text-right whitespace-nowrap">
              {mark.at.kind === "line"
                ? `${mark.at.line} ${RUSTC_GLYPHS.bar}`
                : RUSTC_GLYPHS.bar}
            </span>
            <span className={tone}>
              {mark.primary ? RUSTC_GLYPHS.primary : RUSTC_GLYPHS.secondary}
            </span>
            <span className={cn(tone, "min-w-0 [overflow-wrap:anywhere]")}>
              {mark.label !== null && <Said text={mark.label} />}
            </span>
          </div>
        </div>
      )
    })}
  </>
)

const Child = ({
  child,
  appearance,
}: {
  child: ChildView
  appearance: Appearance
}): JSX.Element => (
  <div data-rustc-child="" className="mt-2 flex min-w-0 flex-col gap-0.5">
    <Line>
      {child.spanless && (
        <span className="text-muted-foreground">{RUSTC_GLYPHS.spanless} </span>
      )}
      <span className={levelClass(child.level)}>{child.level}:</span>{" "}
      <Said text={child.message} />
    </Line>
    {child.location !== null && <Location location={child.location} />}
    <Marks marks={child.marks} />
    {child.fixes.map((fix, at) => (
      <CodeCard
        // eslint-disable-next-line react/no-array-index-key
        key={at}
        code={fix.code}
        firstLine={fix.firstLine}
        changedLines={fix.changedLines}
        inserted={fix.inserted}
        label={WORDS.rustcSuggested}
        appearance={appearance}
        className="mt-1"
      />
    ))}
    {child.loose.map((loose, at) => (
      // eslint-disable-next-line react/no-array-index-key
      <div key={at} className="flex min-w-0 flex-col">
        <Location location={loose.location} />
        <Line className={PRINTED_TONE.suggestion}>
          {RUSTC_GLYPHS.inserted} {loose.replacement}
        </Line>
      </div>
    ))}
  </div>
)

const OneDiagnostic = ({
  view,
  appearance,
}: {
  view: DiagnosticView
  appearance: Appearance
}): JSX.Element => {
  if (view.kind === "bare") {
    return (
      <Line className="text-muted-foreground">
        <Said text={view.message} />
      </Line>
    )
  }
  return (
    <section data-rustc-diagnostic="" className="flex min-w-0 flex-col gap-0.5">
      <Line className="font-bold">
        <span className={levelClass(view.level)}>{view.head}</span>:{" "}
        <Said text={view.message} />
      </Line>
      {view.location !== null && <Location location={view.location} />}
      <Marks marks={view.marks} />
      {view.children.map((child, at) => (
        // eslint-disable-next-line react/no-array-index-key
        <Child key={at} child={child} appearance={appearance} />
      ))}
    </section>
  )
}

/** Every diagnostic in rustc's words and order, laid out to wrap. */
const Diagnostics = ({
  diagnostics,
  program,
  appearance,
}: {
  diagnostics: ReadonlyArray<Diagnostic>
  program: string | null
  appearance: Appearance
}): JSX.Element => (
  <figure
    aria-label={WORDS.rustcSaid}
    className={cn(
      codeSurface(appearance),
      "flex flex-col gap-3 p-3 text-[0.8125rem] leading-normal"
    )}
  >
    {diagnosticView(diagnostics, program).map((view, at) => (
      // eslint-disable-next-line react/no-array-index-key
      <OneDiagnostic key={at} view={view} appearance={appearance} />
    ))}
  </figure>
)

const PrintoutSection = ({
  label,
  text,
  appearance,
}: {
  label: string
  text: string
  appearance: Appearance
}): JSX.Element => (
  <Labelled label={label}>
    <Printout text={text} appearance={appearance} />
  </Labelled>
)

const CompileError = ({
  run,
  program,
  appearance,
}: {
  run: Extract<RustcRun, { outcome: "compile-error" }>
  program: string | null
  appearance: Appearance
}): JSX.Element =>
  run.diagnostics === undefined || run.diagnostics.length === 0 ? (
    <PrintoutSection
      label={WORDS.rustcPrinted}
      text={run.stderr}
      appearance={appearance}
    />
  ) : (
    <>
      <Diagnostics
        diagnostics={run.diagnostics}
        program={program}
        appearance={appearance}
      />
      {/* Open when the laid-out view isn't all rustc printed. */}
      <details className="min-w-0" open={!isWhole(run.diagnostics, run.stderr)}>
        <summary className="text-muted-foreground min-h-11 cursor-pointer py-3 text-xs font-semibold">
          {WORDS.rustcPrinted}
        </summary>
        <Printout text={run.stderr} appearance={appearance} />
      </details>
    </>
  )

export const RunView = ({
  run,
  program = null,
  appearance = "inherit",
  none,
  silent,
}: {
  run: RustcRun | null
  /** The source rustc compiled, which a suggestion is shown applied to. */
  program?: string | null
  /**
   * Art direction for rustc's own text, as `CodeCard` takes it: `inherit`
   * (default) or the host's `"code"`, so it matches the program's card.
   */
  appearance?: Appearance
  /** What the screen says when there is no run. */
  none: string
  /** Said when the program compiled and rustc printed nothing while it did. */
  silent?: string
}): JSX.Element => {
  if (run === null) {
    return <p className="text-muted-foreground text-sm">{none}</p>
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{runHeading(run)}</span>
        <span className="text-muted-foreground font-mono text-xs">
          {WORDS.rustcVersion(run.toolchain)}
        </span>
      </p>
      {run.outcome === "compile-error" ? (
        <CompileError run={run} program={program} appearance={appearance} />
      ) : (
        <>
          {run.compileStderr === "" ? (
            silent !== undefined && <p className="text-sm">{silent}</p>
          ) : (
            <PrintoutSection
              label={WORDS.compiling}
              text={run.compileStderr}
              appearance={appearance}
            />
          )}
          {run.stdout === "" ? (
            <p className="text-muted-foreground text-sm">
              {WORDS.printedNothing}
            </p>
          ) : (
            <Printed label={WORDS.printed} text={run.stdout} />
          )}
          {run.outcome !== "prints" && run.stderr !== "" && (
            <Printed label={WORDS.errorOutput} text={run.stderr} />
          )}
        </>
      )}
    </div>
  )
}
