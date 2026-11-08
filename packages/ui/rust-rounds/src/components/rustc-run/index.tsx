/**
 * rustc's recorded result for a program, as home's rust-runner recorded it
 * (RR3) and laid out from its JSON, as printed: on a card (`../rust-rounds`)
 * and on a week's ticket (`../rust-week`). Its words are the cards'
 * (`lib/play/words`), and `silent` says a program that compiled with
 * nothing from rustc, where a screen says so.
 */
import type { JSX } from "react"
import type { RustcRun } from "@rust-rounds/lib/formats"
import { runHeading, WORDS } from "@rust-rounds/lib/play/words"

/** Text exactly as printed: kept whole, never wrapped, scrolled sideways. */
const Printed = ({
  label,
  text,
}: {
  label: string
  text: string
}): JSX.Element => (
  <section className="flex min-w-0 flex-col gap-1">
    <h3 className="text-muted-foreground text-xs font-semibold">{label}</h3>
    <pre
      data-scroll-intent="code-display"
      className="bg-muted/40 m-0 min-w-0 overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed whitespace-pre"
    >
      {text}
    </pre>
  </section>
)

export const RunView = ({
  run,
  none,
  silent,
}: {
  run: RustcRun | null
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
        <Printed label={WORDS.rustcPrinted} text={run.stderr} />
      ) : (
        <>
          {run.compileStderr === "" ? (
            silent !== undefined && <p className="text-sm">{silent}</p>
          ) : (
            <Printed label={WORDS.compiling} text={run.compileStderr} />
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
