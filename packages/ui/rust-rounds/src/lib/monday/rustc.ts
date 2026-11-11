/**
 * A run of a ticket's program with a real rustc, read the way home records
 * one (`RustcRun`, paulgsc/server `crates/rust_runner`), so the routine checks
 * each `expect` before it puts a week. Home records every program again, in
 * its sandbox, and that recording is what the owner sees; this check keeps a
 * wrong guess from reaching home.
 *
 * Home's profile: `rustc --edition 2024 -C opt-level=0` (`recording.rs`).
 * The process itself is the CLI's (`scripts/monday.ts`); this reads its result.
 */
import type { RustcRun } from "@rust-rounds/lib/formats"

/** The flags home records with, after the source file. */
export const RUSTC_FLAGS = ["--edition", "2024", "-C", "opt-level=0"] as const

/** A run's limit, as home's sandbox stops a program that waits or loops. */
export const RUN_SECONDS = 5

/** The exit status a Rust panic leaves (`std::process::exit` aside). */
const PANIC_STATUS = 101

/** What happened when the program was compiled, and then run if it compiled. */
export type Ran = {
  readonly toolchain: string
  readonly compile: { readonly status: number | null; readonly stderr: string }
  readonly run: {
    readonly status: number | null
    readonly timedOut: boolean
    readonly stdout: string
    readonly stderr: string
  } | null
}

/** The first error's code in rustc's human output: `error[E0502]: …`, or null for `error: …`. */
function firstErrorCode(stderr: string): string | null {
  const match = /^error(?:\[(E\d{4})\])?:/m.exec(stderr)
  return match?.[1] ?? null
}

/** The run as home would record it. */
export function recorded(ran: Ran): RustcRun {
  const { toolchain, compile, run } = ran
  if (compile.status !== 0 || run === null) {
    return {
      outcome: "compile-error",
      toolchain,
      code: firstErrorCode(compile.stderr),
      stderr: compile.stderr,
      span: null,
    }
  }
  const compileStderr = compile.stderr
  if (run.timedOut) {
    return {
      outcome: "stopped",
      toolchain,
      compileStderr,
      why: "time",
      stdout: run.stdout,
      stderr: run.stderr,
    }
  }
  if (run.status === 0) {
    return { outcome: "prints", toolchain, compileStderr, stdout: run.stdout }
  }
  if (run.status === PANIC_STATUS) {
    return {
      outcome: "panics",
      toolchain,
      compileStderr,
      stdout: run.stdout,
      stderr: run.stderr,
    }
  }
  return {
    outcome: "stopped",
    toolchain,
    compileStderr,
    why: "exit",
    stdout: run.stdout,
    stderr: run.stderr,
  }
}

/** The version in `rustc --version`'s line: `1.97.0`. */
export function toolchainOf(versionLine: string): string {
  return /^rustc (\S+)/.exec(versionLine.trim())?.[1] ?? versionLine.trim()
}
