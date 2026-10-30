/**
 * Studio's part in the home link (STUDIO ST9, ST12). `@some-ui/soundbites` is
 * the phone's alone, so only Studio's screens import it
 * (packages/some-vite-config/AUDIENCES.md): its route hands its store, log
 * and rules in (`keepStudio`), and the lanes here name its types alone, as
 * aph's does (`./aph`). Until Studio's route has loaded in this run of the
 * app, the lanes carry nothing of Studio's, and its record waits on the
 * phone for the next send after it has.
 */
import type {
  Project,
  ProjectStore,
  Sitting,
  StudioNote,
  TimeEvent,
} from "@some-ui/soundbites"

/** What the lanes need of Studio, handed in by its route. */
export type StudioKeeping = {
  /** What the lanes read of Studio's projects. */
  readonly store: Pick<
    ProjectStore,
    "list" | "audio" | "friction" | "subscribe"
  >
  /** The time log as kept on the phone. */
  readonly timeLog: () => ReadonlyArray<TimeEvent>
  readonly notesForHome: (
    projects: ReadonlyArray<Project>
  ) => ReadonlyArray<StudioNote>
  /** Lets the audio of each take home holds (`held`) leave the phone. */
  readonly letGoHeldTakes: (held: ReadonlySet<string>) => Promise<number>
  readonly sittingKey: (sitting: Sitting) => string
}

let keeping: StudioKeeping | null = null
const listeners = new Set<() => void>()

/** Studio's route hands its pieces in; the lanes then carry its record. */
export function keepStudio(handed: StudioKeeping): void {
  if (keeping !== null) return
  keeping = handed
  for (const listener of listeners) listener()
}

/** Studio's pieces, once its route has handed them in; null until then. */
export function studioKeeping(): StudioKeeping | null {
  return keeping
}

/** Calls `listener` once Studio's pieces are handed in. */
export function onStudioKept(listener: () => void): () => void {
  listeners.add(listener)
  return (): void => {
    listeners.delete(listener)
  }
}
