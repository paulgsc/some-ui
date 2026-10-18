import type { SessionFileFinding } from "@leetype/lib/leetype/session-file"
import { lintSessionFile } from "@leetype/lib/leetype/session-file"
import type { SessionFile } from "@leetype/types/session-file"
import { SessionFileSchema } from "@leetype/types/session-file"
import { assertNever } from "@some-ui/core-utils"
import type { PickedFileState } from "@some-ui/intent-kit"
import { PickedFileRuntime } from "@some-ui/intent-kit"

/**
 * Pulling a session file onto the phone (canon v1.2, Rem. 11.7): an agent
 * writes it to Drive's LeetType/sessions (the Drive SOP), the person picks it
 * through the system picker, and the phone keeps it in its content store.
 *
 * A file that does not parse is refused with the schema's message; the
 * content lint's findings (Rem. 10.3) are shown and never refuse it, since
 * they are the author's to fix and the session still plays.
 *
 * A file's name, less `.json`, is its identity: the session log names it in
 * every event (`session-log/model.ts`), so a store never lets a different
 * file take a name it holds. The Drive SOP has agents put a fix up under a
 * new name, and the old one stays.
 *
 * Its lane is Drive's: the Drive copy is the record and is kept forever, so
 * the phone's copy is one more read of it. Letting the phone's copy go is
 * for the session shell (#1921), which knows which files the log still
 * waits on.
 */

export type HeldSessionFile = {
  readonly name: string
  readonly title: string
  readonly oneLine: string
  readonly pickedAt: string
}

/**
 * `"already-held"`: these exact bytes, under this name. `"name-taken"`: other
 * bytes under this name, refused. `"full"`: the phone's storage budget
 * refused the write.
 */
export type KeepOutcome = "kept" | "already-held" | "name-taken" | "full"

/**
 * Where the phone keeps the session files picked (`apps/www`: the device
 * backend's content store). `body` is the file's text, kept verbatim.
 */
export type SessionFileStore = {
  readonly list: () => Promise<ReadonlyArray<HeldSessionFile>>
  readonly keep: (
    file: Omit<HeldSessionFile, "pickedAt"> & { readonly body: string },
    at: Date
  ) => Promise<KeepOutcome>
  readonly read: (name: string) => Promise<string | null>
}

export type SessionFileIntake =
  | {
      readonly ok: true
      readonly name: string
      readonly file: SessionFile
      readonly findings: ReadonlyArray<SessionFileFinding>
    }
  | { readonly ok: false; readonly reason: string }

/** How many of the schema's issues a refusal names. */
const ISSUES_SHOWN = 3

/** A picked file's name as the session log names it: no `.json`. */
function sessionFileName(fileName: string): string {
  return fileName.trim().replace(/\.json$/i, "")
}

/** Parses and lints a picked file; nothing here keeps it. */
export function intakeSessionFile(
  fileName: string,
  text: string
): SessionFileIntake {
  const name = sessionFileName(fileName)
  if (name === "") {
    return { ok: false, reason: "That file has no name to keep it under." }
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return {
      ok: false,
      reason: `${name} isn't a session file: it isn't JSON.`,
    }
  }
  const parsed = SessionFileSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues
    const shown = issues
      .slice(0, ISSUES_SHOWN)
      .map((issue) =>
        issue.path.length > 0
          ? `${issue.path.join(".")}: ${issue.message}`
          : issue.message
      )
    const more = issues.length - shown.length
    return {
      ok: false,
      reason: `${name} isn't a session file. ${shown.join("; ")}${
        more > 0 ? `; and ${String(more)} more` : ""
      }.`,
    }
  }
  return {
    ok: true,
    name,
    file: parsed.data,
    findings: lintSessionFile(parsed.data),
  }
}

type HeldState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly files: ReadonlyArray<HeldSessionFile> }
  | { readonly kind: "failed"; readonly summary: string }

export type PickState =
  | { readonly kind: "idle" }
  | { readonly kind: "reading" }
  | { readonly kind: "keeping"; readonly name: string }
  | { readonly kind: "refused"; readonly reason: string }
  | {
      readonly kind: "kept"
      readonly name: string
      readonly title: string
      readonly already: boolean
      readonly findings: ReadonlyArray<SessionFileFinding>
    }

export type SessionFilePickSnapshot = {
  readonly held: HeldState
  readonly pick: PickState
}

/** The file as the platform's picker hands it over. */
export type PickedSessionFile = Pick<File, "name" | "size" | "text">

const COULD_NOT_KEEP = "Couldn't keep that file on this phone. Try again."
const COULD_NOT_LIST = "Couldn't read the session files on this phone."

/** The name a fix of `name` goes up under (the Drive SOP's `-r<n>`). */
function nextRevision(name: string): string {
  const match = /^(.*)-r(\d+)$/.exec(name)
  return match
    ? `${match[1] ?? ""}-r${String(Number(match[2]) + 1)}`
    : `${name}-r2`
}

function refusalOf(outcome: KeepOutcome, name: string): string | null {
  switch (outcome) {
    case "name-taken": {
      return `This phone already holds a different file named ${name}. A fix goes up under a new name, such as ${nextRevision(name)}.`
    }
    case "full": {
      return "This phone is full: free some space, then pick the file again."
    }
    case "kept":
    case "already-held": {
      return null
    }
    default: {
      return assertNever(outcome)
    }
  }
}

/**
 * The picker card's coordinator: one read in flight (`PickedFileRuntime`),
 * then its keep, and the list of held files read again whenever a keep
 * lands. A keep is never abandoned once sent, so a newer pick does not stop
 * an earlier write; `turn` only decides whose outcome the card shows, and
 * `listTurn` which list.
 */
export class SessionFilePickRuntime {
  private snapshot: SessionFilePickSnapshot = {
    held: { kind: "loading" },
    pick: { kind: "idle" },
  }
  private readonly listeners = new Set<() => void>()
  private turn = 0
  private listTurn = 0
  private stopReading: (() => void) | null = null
  private stopped = false

  constructor(
    private readonly store: SessionFileStore,
    private readonly now: () => Date = () => new Date(),
    private readonly reader: PickedFileRuntime = new PickedFileRuntime()
  ) {}

  getSnapshot = (): SessionFilePickSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Reads the held list. */
  start = (): void => {
    this.stopped = false
    const turn = ++this.listTurn
    this.store.list().then(
      (files) => {
        if (turn === this.listTurn) this.set({ held: { kind: "ready", files } })
      },
      () => {
        if (turn === this.listTurn) {
          this.set({ held: { kind: "failed", summary: COULD_NOT_LIST } })
        }
      }
    )
  }

  pick = (file: PickedSessionFile): void => {
    const turn = ++this.turn
    this.stopReading?.()
    // The reader's own failures (too large, unreadable, too slow) refuse.
    this.stopReading = this.reader.subscribe(() => {
      const state: PickedFileState = this.reader.getSnapshot()
      if (turn === this.turn && state.kind === "failed") {
        this.set({ pick: { kind: "refused", reason: state.summary } })
      }
    })
    this.set({ pick: { kind: "reading" } })
    this.reader.open(file, (text) => {
      if (turn === this.turn) this.keep(turn, file.name, text)
    })
  }

  /** The person left: nothing in flight changes the card. */
  cancel = (): void => {
    this.stopped = true
    this.turn += 1
    this.listTurn += 1
    this.stopReading?.()
    this.stopReading = null
    this.reader.cancel()
  }

  private keep(turn: number, fileName: string, text: string): void {
    const intake = intakeSessionFile(fileName, text)
    if (!intake.ok) {
      this.set({ pick: { kind: "refused", reason: intake.reason } })
      return
    }
    const { name, file, findings } = intake
    this.set({ pick: { kind: "keeping", name } })
    this.store
      .keep(
        { name, title: file.title, oneLine: file.oneLine, body: text },
        this.now()
      )
      .then(
        (outcome) => {
          if (outcome === "kept" && !this.stopped) this.start()
          if (turn !== this.turn) return
          const reason = refusalOf(outcome, name)
          this.set({
            pick:
              reason === null
                ? {
                    kind: "kept",
                    name,
                    title: file.title,
                    already: outcome === "already-held",
                    findings,
                  }
                : { kind: "refused", reason },
          })
        },
        () => {
          if (turn === this.turn) {
            this.set({ pick: { kind: "refused", reason: COULD_NOT_KEEP } })
          }
        }
      )
  }

  private set(next: Partial<SessionFilePickSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of this.listeners) listener()
  }
}
