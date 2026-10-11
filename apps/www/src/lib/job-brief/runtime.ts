import { foreignValue } from "@/lib/intent/foreign"
import type { Desk, DeskEvent, ParsedBrief } from "@/lib/job-brief"
import {
  confirmationFileName,
  confirmationOf,
  loadDesk,
  parseBrief,
  saveDesk,
  step,
} from "@/lib/job-brief"
import { shareFiles } from "@/lib/share-files"
import type { StorageAdapter } from "@/lib/tenant/storage"
import { browserLocalStorage } from "@/lib/tenant/storage"

/** Reading a picked file: nothing in hand, reading, or not a brief (and why). */
export type Importing =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "rejected"; problem: string }

type DeskSnapshot = { desk: Desk; importing: Importing }

export type DeskPorts = {
  storage: StorageAdapter
  /** Opens the share sheet with one JSON file; throws when sharing failed. */
  share: (name: string, json: string) => Promise<"shared" | "cancelled">
  now: () => Date
}

export type DeskRuntime = {
  getSnapshot: () => DeskSnapshot
  subscribe: (listener: () => void) => () => void
  /** Reads `file` as a brief. A later pick wins over one still being read. */
  open: (file: Blob) => void
  dispatch: (event: Exclude<DeskEvent, { type: "opened" | "shared" }>) => void
  /**
   * Shares the confirmation `confirmationOf` gives now. The desk moves to
   * confirmed only if it still holds that brief when the sheet closes.
   */
  share: () => Promise<"shared" | "cancelled">
}

const IDLE: Importing = { kind: "idle" }

export function createDeskRuntime(ports: DeskPorts): DeskRuntime {
  let snapshot: DeskSnapshot = {
    desk: loadDesk(ports.storage),
    importing: IDLE,
  }
  const listeners = new Set<() => void>()
  let picks = 0

  const set = (next: DeskSnapshot): void => {
    if (next.desk !== snapshot.desk) saveDesk(ports.storage, next.desk)
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  const apply = (event: DeskEvent): void => {
    const desk = step(snapshot.desk, event)
    if (desk !== snapshot.desk) set({ ...snapshot, desk })
  }

  const read = async (file: Blob, pick: number): Promise<void> => {
    let parsed: ParsedBrief
    try {
      parsed = parseBrief(await file.text())
    } catch {
      parsed = { ok: false, problem: "Couldn’t read that file." }
    }
    if (pick !== picks) return
    if (parsed.ok) {
      set({
        desk: step(snapshot.desk, { type: "opened", brief: parsed.brief }),
        importing: IDLE,
      })
    } else {
      set({
        ...snapshot,
        importing: { kind: "rejected", problem: parsed.problem },
      })
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    open: (file): void => {
      picks += 1
      set({ ...snapshot, importing: { kind: "reading" } })
      void read(file, picks)
    },
    dispatch: apply,
    share: async (): Promise<"shared" | "cancelled"> => {
      const confirmation = confirmationOf(snapshot.desk, ports.now())
      if (confirmation === null) return "cancelled"
      const result = await ports.share(
        confirmationFileName(confirmation.briefId),
        JSON.stringify(confirmation, null, 2)
      )
      if (result === "shared") apply({ type: "shared", confirmation })
      return result
    },
  }
}

let phoneDesk: DeskRuntime | null = null

/**
 * The phone's desk: kept in this device's storage, shared through the sheet.
 * Made on first use, so importing this module reads nothing.
 */
export function jobDesk(): DeskRuntime {
  phoneDesk ??= createDeskRuntime({
    storage: browserLocalStorage,
    share: (name, json) =>
      foreignValue({
        outcome: shareFiles(
          "job-confirmation",
          "Job application confirmation",
          [{ name, data: json }]
        ),
      }),
    now: () => new Date(),
  })
  return phoneDesk
}
