/**
 * What Studio's screen hands to the home link (STUDIO ST9, ST12).
 * `@some-ui/soundbites` is the phone's alone, so only Studio's screens import
 * it (packages/some-vite-config/AUDIENCES.md): its route hands its store, log
 * and rules in here (`keepStudio`), and the voice and send lanes
 * (`lib/home-link`) read them, naming soundbites' types alone. This module
 * calls nothing of the link and sends nothing: it only holds what was handed
 * in. Until Studio's route has loaded in this run of the app, the lanes carry
 * nothing of Studio's, and its record waits on the phone for the next send
 * after it has.
 */
import type {
  Project,
  ProjectStore,
  Sitting,
  StudioNote,
  TimeEvent,
} from "@some-ui/soundbites"

import { handedIn } from "@/lib/handed-in"

/** What the lanes need of Studio, handed in by its route. */
type StudioKeeping = {
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
  /**
   * Marks each take home holds (`held`) as kept there, and lets the audio of
   * each the owner's choice allows leave the phone (HF11, LG1).
   */
  readonly letGoHeldTakes: (held: ReadonlySet<string>) => Promise<number>
  readonly sittingKey: (sitting: Sitting) => string
}

const studio = handedIn<StudioKeeping>()

/** Studio's route hands its pieces in; the lanes then carry its record. */
export const keepStudio = studio.keep

/** Studio's pieces, once its route has handed them in; null until then. */
export const studioKeeping = studio.kept

/** Calls `listener` once Studio's pieces are handed in. */
export const onStudioKept = studio.onKept
