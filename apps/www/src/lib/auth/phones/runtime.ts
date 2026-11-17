/**
 * The phone list's runtime (SIGNIN7): runs `./model`'s step over ports that
 * ask home (`./home`), and owns which answer still counts. A read that a
 * newer read has passed is dropped, so a slow first read never replaces a
 * list read after a sign-out or a rename, each of which reads again. A rename or a sign-out answers for the phone
 * it was asked about, which the model checks against what is under way.
 */
import type { Phone, PhonesEvent, PhonesState, Refusal } from "./model"
import { INITIAL, step } from "./model"

/** What the runtime asks of home. Each rejects with why it didn't happen. */
export type PhonesPorts = {
  readonly list: () => Promise<ReadonlyArray<Phone>>
  readonly rename: (id: string, name: string | null) => Promise<void>
  readonly signOut: (id: string) => Promise<void>
  /** Why a rename or sign-out was refused, from what it rejected with. */
  readonly refusalOf: (error: unknown) => Refusal
}

export type Phones = {
  readonly getSnapshot: () => PhonesState
  readonly subscribe: (listener: () => void) => () => void
  /** Reads the list again; the newest read's answer is the one kept. */
  readonly read: () => void
  readonly renamePressed: (id: string) => void
  readonly typed: (text: string) => void
  /** Saves the name `lib/phone-name` took (null clears it). */
  readonly save: (name: string | null) => void
  readonly signOutPressed: (id: string) => void
  readonly confirm: () => void
  readonly cancel: () => void
  readonly dismiss: () => void
}

export function createPhones(ports: PhonesPorts): Phones {
  let state = INITIAL
  const listeners = new Set<() => void>()
  /** Counts reads, so only the newest one's answer is kept. */
  let reads = 0

  const dispatch = (event: PhonesEvent): void => {
    const next = step(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const read = (): void => {
    reads += 1
    const asked = reads
    dispatch({ type: "readStarted" })
    ports.list().then(
      (phones) => {
        if (asked === reads) dispatch({ type: "read", phones })
      },
      (error: unknown) => {
        if (asked !== reads) return
        dispatch({
          type: "readFailed",
          signedOut: ports.refusalOf(error) === "signedOut",
        })
      }
    )
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    read,
    renamePressed: (id) => dispatch({ type: "renamePressed", id }),
    typed: (text) => dispatch({ type: "typed", text }),
    save: (name): void => {
      const before = state
      dispatch({ type: "savePressed", name })
      if (state === before || state.doing.kind !== "saving") return
      const { id } = state.doing
      ports.rename(id, name).then(
        () => {
          dispatch({ type: "saved", id, name })
          // A read asked before the rename landed holds the old name; this
          // one passes it.
          read()
        },
        (error: unknown) =>
          dispatch({ type: "saveFailed", id, why: ports.refusalOf(error) })
      )
    },
    signOutPressed: (id) => dispatch({ type: "signOutPressed", id }),
    confirm: (): void => {
      const before = state
      dispatch({ type: "confirmed" })
      if (state === before || state.doing.kind !== "signingOut") return
      const { id } = state.doing
      ports.signOut(id).then(
        () => {
          dispatch({ type: "signedOut", id })
          // Home's own list, which may hold another change since.
          read()
        },
        (error: unknown) => {
          const why = ports.refusalOf(error)
          dispatch({
            type: "signOutFailed",
            id,
            why: why === "refused" ? "failed" : why,
          })
        }
      )
    },
    cancel: () => dispatch({ type: "cancelled" }),
    dismiss: () => dispatch({ type: "dismissed" }),
  }
}
