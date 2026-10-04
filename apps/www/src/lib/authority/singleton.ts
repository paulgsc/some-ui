/** The one authority instance, wired to this build's flags and to browser storage. */
import { DATA_MODE } from "@/lib/data-mode"

import type { AuthorityPorts } from "./runtime"
import { createAuthority } from "./runtime"
import type { Backend, Choice } from "./state"

/** What this build can reach, from its build flags. */
function backendOf(
  device: boolean = import.meta.env.VITE_DEVICE_BACKEND === "true",
  mode: typeof DATA_MODE = DATA_MODE
): Backend {
  if (device) return "in-process"
  return mode === "static" ? "none" : "remote"
}

const STORAGE_KEY = "some-ui.authority.v1"

function isChoice(value: unknown): value is Choice {
  return value === "local" || value === "account"
}

type Remembered = { choice: Choice | null; reporting: boolean }

/** What this browser remembered. Unreadable or absent storage is "nothing". */
function readRemembered(storage: Storage | undefined): Remembered {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (raw === null || raw === undefined) {
      return { choice: null, reporting: false }
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) {
      return { choice: null, reporting: false }
    }
    const choice = "choice" in parsed ? parsed.choice : undefined
    const reporting = "reporting" in parsed ? parsed.reporting : undefined
    return {
      choice: isChoice(choice) ? choice : null,
      reporting: reporting === true,
    }
  } catch {
    return { choice: null, reporting: false }
  }
}

/** Browser storage as the runtime's port. Both facts share one record. */
export function browserPorts(
  storage: Storage | undefined = safeStorage()
): AuthorityPorts {
  const write = (next: Partial<Remembered>): void => {
    try {
      storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...readRemembered(storage), ...next })
      )
    } catch {
      // Private mode or a full quota: the setting lasts this page load.
    }
  }
  return {
    readChoice: (): Choice | null => readRemembered(storage).choice,
    writeChoice: (choice): void => {
      write({ choice })
    },
    readReporting: (): boolean => readRemembered(storage).reporting,
    writeReporting: (reporting): void => {
      write({ reporting })
    },
    onRemoteChange: (listener): (() => void) => {
      if (typeof window === "undefined") return () => undefined
      // Fired in every *other* document of this origin when its storage changes.
      const onStorage = (event: StorageEvent): void => {
        if (event.key === STORAGE_KEY || event.key === null) listener()
      }
      window.addEventListener("storage", onStorage)
      return (): void => {
        window.removeEventListener("storage", onStorage)
      }
    },
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export const authority = createAuthority(backendOf(), browserPorts())
