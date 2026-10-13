/**
 * The owner's Drive filing, as a sidecar on the share sheet: when a share's
 * sheet opens, a toast names the Drive folder its files belong in, by the
 * Drive's own SOP (the Doc "README — Drive SOP"; `.claude/skills/drive-sop`).
 * It renames nothing: the files name each other (`context.json` its
 * soundbites, a drama prompt its voice notes, `takes.json` its takes), and
 * the SOP files them under the names the app gives.
 *
 * It is one person's workflow, not the app's: only main.tsx's install
 * imports it, so deleting this directory and that line removes it, and every
 * share is the same without it. Phone-only (`build.paths.ts`).
 */
import { dayOf } from "@some-ui/core-utils"
import { toast } from "sonner"

import type { ShareSidecar } from "@/lib/share-files"

/**
 * Each share's folder, by the `dir` it shares from (`shareFiles`'s first
 * argument), given the local day it is shared; its test checks every `dir`.
 */
export const DRIVE_FOLDERS: Readonly<
  Partial<Record<string, (day: string) => string>>
> = {
  reflections: () => "Study ledger › reflections",
  // One folder per export: each `context.json` is a full snapshot, and the
  // next export's files carry the same names.
  "agent-export": (day) => `Study ledger › study-context › ${day} (new folder)`,
  "journal-takes": () => "Build Journal › voice › takes",
  "drama-prompt": () => "Dramas › requests",
}

/** Where `dir`'s files go in Drive when shared at `at`; none for an unfiled `dir`. */
export function driveFolder(dir: string, at: Date): string | undefined {
  return DRIVE_FOLDERS[dir]?.(dayOf(at))
}

export type Notice = {
  show: (title: string, description: string) => string | number
  dismiss: (id: string | number) => void
}

const TOAST: Notice = {
  show: (title, description) =>
    toast(title, { description, duration: Number.POSITIVE_INFINITY }),
  dismiss: (id) => {
    toast.dismiss(id)
  },
}

/**
 * The sidecar: the folder stays on screen while the sheet is open, above it
 * (the phone's toasts sit at the top, `providers/toaster`), and goes once the
 * sheet settles.
 */
export function driveFiling(
  notice: Notice = TOAST,
  now: () => Date = () => new Date()
): ShareSidecar {
  return {
    opening: (dir): (() => void) | undefined => {
      const folder = driveFolder(dir, now())
      if (folder === undefined) return
      const id = notice.show("In Drive, save to", folder)
      return () => notice.dismiss(id)
    },
  }
}
