/** The one authority instance, wired to this build's flags and to browser storage. */
import { DATA_MODE, DEVICE_BACKEND } from "@/lib/data-mode"

import type { AuthorityPorts } from "./runtime"
import { createAuthority } from "./runtime"
import type { Backend, Choice } from "./state"

/** What this build can reach, from its build flags. */
function backendOf(
  device: boolean = DEVICE_BACKEND,
  mode: typeof DATA_MODE = DATA_MODE
): Backend {
  if (device) return "in-process"
  return mode === "static" ? "none" : "remote"
}

const STORAGE_KEY = "some-ui.authority.v1"

function isChoice(value: unknown): value is Choice {
  return value === "local" || value === "account"
}

/** Browser storage as the runtime's port. Unreadable or absent storage is "no choice". */
export function browserPorts(
  storage: Storage | undefined = safeStorage()
): AuthorityPorts {
  return {
    readChoice: (): Choice | null => {
      try {
        const raw = storage?.getItem(STORAGE_KEY)
        if (raw === null || raw === undefined) return null
        const parsed: unknown = JSON.parse(raw)
        const choice =
          typeof parsed === "object" && parsed !== null && "choice" in parsed
            ? parsed.choice
            : undefined
        return isChoice(choice) ? choice : null
      } catch {
        return null
      }
    },
    writeChoice: (choice): void => {
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify({ choice }))
      } catch {
        // Private mode or a full quota: the choice lasts this page load.
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
