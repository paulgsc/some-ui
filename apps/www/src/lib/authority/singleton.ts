/** The one authority instance, wired to this build's flags and to browser storage. */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  openKept,
  readJson,
  writeKept,
} from "@some-ui/core-utils"

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

const NOTHING: Remembered = { choice: null, reporting: false }

/** Each fact read on its own; a value that is not an object is moved aside. */
const readRemembered = readJson((parsed): Remembered | null => {
  if (typeof parsed !== "object" || parsed === null) return null
  const choice = "choice" in parsed ? parsed.choice : undefined
  const reporting = "reporting" in parsed ? parsed.reporting : undefined
  return {
    choice: isChoice(choice) ? choice : null,
    reporting: reporting === true,
  }
})

/** What this browser remembered. Unreadable or absent storage is "nothing". */
function remembered(storage: KeyedStorage | null): Remembered {
  return openKept(storage, STORAGE_KEY, readRemembered, NOTHING).value
}

/** Browser storage as the runtime's port. Both facts share one record. */
export function browserPorts(
  storage: KeyedStorage | null = localStorageOrNull()
): AuthorityPorts {
  // Private mode or a full quota: the setting lasts this page load.
  const write = (next: Partial<Remembered>): void => {
    writeKept(
      storage,
      STORAGE_KEY,
      { ...remembered(storage), ...next },
      readRemembered
    )
  }
  return {
    readChoice: (): Choice | null => remembered(storage).choice,
    writeChoice: (choice): void => {
      write({ choice })
    },
    readReporting: (): boolean => remembered(storage).reporting,
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

export const authority = createAuthority(backendOf(), browserPorts())
