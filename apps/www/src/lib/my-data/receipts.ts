/**
 * My data's Deleted page (MY-DATA MD3, #2477): the receipts home keeps of
 * what was deleted for good, read each time the page opens or is dragged
 * down. `stepReceipts` decides which answer is stale (each read is
 * numbered, and an answer to an earlier one changes nothing); a read again
 * keeps what was shown until its answer lands. The page reads the snapshot.
 */
import { assertNever } from "@some-ui/core-utils"

import type { ReceiptsReading } from "./deleting"

export type ReceiptsState = {
  readonly seq: number
  readonly reading: ReceiptsReading
}

const INITIAL_RECEIPTS: ReceiptsState = {
  seq: 0,
  reading: { kind: "reading" },
}

type ReceiptsEvent =
  | { readonly type: "asked" }
  | {
      readonly type: "answered"
      readonly seq: number
      readonly reading: ReceiptsReading
    }

function stepReceipts(
  state: ReceiptsState,
  event: ReceiptsEvent
): ReceiptsState {
  switch (event.type) {
    case "asked": {
      return { ...state, seq: state.seq + 1 }
    }
    case "answered": {
      return event.seq === state.seq
        ? { ...state, reading: event.reading }
        : state
    }
    default: {
      return assertNever(event)
    }
  }
}

export type ReceiptsPorts = {
  /** Home's receipts, or why there are none; never rejects. */
  readonly askHome: () => Promise<ReceiptsReading>
}

export type Receipts = {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => ReceiptsState
  /** Reads the receipts. */
  readonly open: () => void
  /** Reads again, for a pull: rejects when home didn't answer. */
  readonly checkAgain: () => Promise<void>
}

export function createReceipts(ports: ReceiptsPorts): Receipts {
  let state = INITIAL_RECEIPTS
  const listeners = new Set<() => void>()

  const dispatch = (event: ReceiptsEvent): void => {
    const next = stepReceipts(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }

  const read = async (): Promise<ReceiptsReading> => {
    dispatch({ type: "asked" })
    const { seq } = state
    const reading = await ports.askHome()
    dispatch({ type: "answered", seq, reading })
    return reading
  }

  return {
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    open(): void {
      void read()
    },
    async checkAgain(): Promise<void> {
      const reading = await read()
      if (reading.kind === "unreachable") throw new Error("home didn't answer")
    },
  }
}
