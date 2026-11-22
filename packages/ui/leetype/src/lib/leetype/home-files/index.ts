import type { SessionFileStore } from "@leetype/lib/leetype/session-file-pick"
import { intakeSessionFile } from "@leetype/lib/leetype/session-file-pick"
import { assertNever } from "@some-ui/core-utils"

import type { HomeSessionFiles, ListedFile, ListingEnded } from "./model"
import { listedOf } from "./model"
import { HOME_FILES_WORDS as WORDS } from "./words"

/**
 * The picker's "From home" list (#1916): the session files the paired home
 * holds, by thread, and keeping a thread's files on the phone at a tap, so
 * the thread plays offline. The phone's content store is the offline copy:
 * a file kept from home lands in the same `SessionFileStore`, under the
 * same rules as one picked from storage (a held name never takes other
 * bytes, and the content lint is shown and never refuses), and from then on
 * plays from the phone with no connection.
 *
 * The list is read when the picker opens and after each keep, never on a
 * timer and never retried: the host's look already holds how a read goes
 * (`apps/www/src/lib/home-link/leetype-files.ts`, LA15). A fetch goes only
 * from the keep's tap, and only for a name the phone does not hold.
 */
export type {
  HomeFileAnswer,
  HomeListing,
  HomeSessionFiles,
  ListingEnded,
} from "./model"
export { threadsOf } from "./model"
export { HOME_FILES_WORDS } from "./words"

type HomeLook =
  | { readonly kind: "looking" }
  | {
      readonly kind: "listed"
      readonly files: ReadonlyArray<ListedFile>
      /** How the latest look ended, when it brought nothing new. */
      readonly ended: ListingEnded | null
    }

type HomeKeep =
  | { readonly kind: "idle" }
  | {
      readonly kind: "keeping"
      readonly thread: number | null
      readonly done: number
      readonly of: number
    }
  /** A keep ended: what it says, in words. */
  | { readonly kind: "said"; readonly words: string }

export type HomeFilesSnapshot = {
  readonly look: HomeLook
  readonly keep: HomeKeep
}

type Tally = {
  kept: number
  /** Kept with the content lint's findings, which never refuse. */
  noted: number
  left: number
  /** Why the first that was left was left. */
  why: string | null
}

/**
 * The "From home" list's coordinator: one look at a time, and one keep at a
 * time, each file of it fetched and kept in turn. A keep is never abandoned
 * once a file is fetched, so a cancel does not stop a write; `turn` only
 * decides whether its outcome is shown.
 */
export class HomeFilesRuntime {
  private snapshot: HomeFilesSnapshot = {
    look: { kind: "looking" },
    keep: { kind: "idle" },
  }
  private readonly listeners = new Set<() => void>()
  private lookTurn = 0
  private keepTurn = 0
  private stopped = false

  constructor(
    private readonly home: HomeSessionFiles,
    private readonly store: SessionFileStore,
    /** Called once a keep put a file on the phone, so its list reads again. */
    private readonly onKept: () => void,
    private readonly now: () => Date = () => new Date()
  ) {}

  getSnapshot = (): HomeFilesSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Looks at what home holds; what was shown stays until the look lands. */
  start = (): void => {
    this.stopped = false
    const turn = ++this.lookTurn
    void this.home.list().then(({ files, ended }) => {
      if (turn !== this.lookTurn) return
      const shown =
        this.snapshot.look.kind === "listed" ? this.snapshot.look.files : []
      // A look that brought nothing new keeps what was shown last.
      this.set({
        look: {
          kind: "listed",
          files: ended === null ? listedOf(files) : shown,
          ended,
        },
      })
    })
  }

  /** The person left: nothing in flight changes the list. */
  cancel = (): void => {
    this.stopped = true
    this.lookTurn += 1
    this.keepTurn += 1
  }

  /**
   * Keeps on the phone each of `names` (a thread's files the phone does not
   * hold, as home lists them), one after another.
   */
  keepThread = (thread: number | null, names: ReadonlyArray<string>): void => {
    if (this.snapshot.keep.kind === "keeping" || names.length === 0) return
    const turn = ++this.keepTurn
    void this.keepEach(turn, thread, names)
  }

  private async keepEach(
    turn: number,
    thread: number | null,
    names: ReadonlyArray<string>
  ): Promise<void> {
    const tally: Tally = { kept: 0, noted: 0, left: 0, why: null }
    const leave = (why: string): void => {
      tally.left += 1
      tally.why ??= why
    }
    for (const [done, name] of names.entries()) {
      if (turn !== this.keepTurn) return
      this.set({ keep: { kind: "keeping", thread, done, of: names.length } })
      const answer = await this.home.fetch(name)
      if (answer.kind !== "file") {
        leave(answer.kind === "gone" ? WORDS.gone : WORDS.why[answer.kind])
        // Home can't be reached or is busy: the rest would end the same way.
        if (answer.kind !== "gone") {
          tally.left += names.length - done - 1
          break
        }
        continue
      }
      const kept = await this.keepOne(name, answer.body)
      if (kept.ok) {
        tally.kept += 1
        if (kept.noted) tally.noted += 1
      } else leave(kept.why)
    }
    // Once the person left, the lists are read again when they come back.
    if (tally.kept > 0 && !this.stopped) {
      this.onKept()
      this.start()
    }
    if (turn !== this.keepTurn) return
    const words = [
      tally.kept > 0 || tally.left === 0 ? WORDS.kept(tally.kept) : null,
      tally.noted > 0 ? WORDS.noted(tally.noted) : null,
      tally.left > 0
        ? WORDS.someLeft(tally.left, tally.why ?? WORDS.why.failed)
        : null,
    ]
      .filter((line) => line !== null)
      .join(" ")
    this.set({ keep: { kind: "said", words } })
  }

  /** Keeps one fetched file: on the phone, or why it isn't. */
  private async keepOne(
    name: string,
    body: string
  ): Promise<
    | { readonly ok: true; readonly noted: boolean }
    | { readonly ok: false; readonly why: string }
  > {
    const intake = intakeSessionFile(name, body)
    if (!intake.ok) return { ok: false, why: intake.reason }
    const noted = intake.findings.length > 0
    try {
      const outcome = await this.store.keep(
        {
          name: intake.name,
          title: intake.file.title,
          oneLine: intake.file.oneLine,
          body,
        },
        this.now()
      )
      switch (outcome) {
        case "kept":
        case "already-held": {
          return { ok: true, noted }
        }
        case "name-taken": {
          return { ok: false, why: WORDS.nameTaken(intake.name) }
        }
        case "full": {
          return { ok: false, why: WORDS.full }
        }
        default: {
          return assertNever(outcome)
        }
      }
    } catch {
      return { ok: false, why: WORDS.couldNotKeep }
    }
  }

  private set(next: Partial<HomeFilesSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of this.listeners) listener()
  }
}
