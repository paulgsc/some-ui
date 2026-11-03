/**
 * My data (MY-DATA MD2, #2476): what you keep, where, how much and how it
 * grows, read only. `./model` is what the page shows, `./state` and
 * `./runtime` read it and play a recording, `./words` says it, and this
 * module wires the runtime to the phone: home through its read of what it
 * keeps, the record's count with it on the overview
 * (`lib/home-link/kept-read`, LA8), and this phone's recordings as
 * the voice lane lists them and says where each is kept
 * (`lib/home-link/voice-copy`'s `recordingsOnPhone` and `voiceKept`). Phone-only
 * (`build.paths.ts`).
 *
 * Deleting a record home keeps (MD3, #2477) is `./deleting` and
 * `./deleting-runtime`; the Deleted page's receipts are `./receipts`.
 */
import { assertNever } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { audioPlayer } from "@some-ui/voice-capture"

import { deleteNotes } from "@/lib/home-link/delete-note"
import { askDeleted } from "@/lib/home-link/deleted-read"
import { askKept } from "@/lib/home-link/kept-read"
import {
  letGoDeleted,
  recordingsOnPhone,
  voiceKept,
} from "@/lib/home-link/voice-copy"

import type { DeletableKind, ReceiptsReading } from "./deleting"
import { readReceipts } from "./deleting"
import type { Deleting } from "./deleting-runtime"
import { createDeleting } from "./deleting-runtime"
import type { HomeReading, Of, PhoneNote, PhoneRead } from "./model"
import { readKept } from "./model"
import type { Receipts } from "./receipts"
import { createReceipts } from "./receipts"
import type { MyData } from "./runtime"
import { createMyData } from "./runtime"

export type { KindItem, Of, Overview, Where } from "./model"
export { isKind, kindOf, overviewOf, WHERE_ORDER } from "./model"
export type { DeletableKind, DeleteSheet, Receipt } from "./deleting"
export { isDeletableKind, offersDelete } from "./deleting"
export type { Deleting } from "./deleting-runtime"
export type { Receipts, ReceiptsState } from "./receipts"
export type { MyData } from "./runtime"
export type { MyDataState } from "./state"

/** How often a read waits for the link to be free: it takes one run at a time, and a drag down drains every lane in turn (PULL3). */
const TRIES = 10
const WAIT_MS = 1_000

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** What a read of home says when it has no answer to read. */
type NotAnswered =
  | { readonly kind: "unpaired" }
  | { readonly kind: "busy" }
  | { readonly kind: "unreachable" }

/** Asks home with `ask`, again while the link is busy, and reads its answer. */
async function askWhileBusy<A extends { readonly kind: "answered" }, R>(
  ask: () => Promise<A | NotAnswered>,
  read: (answered: A) => R
): Promise<
  R | { readonly kind: "unpaired" } | { readonly kind: "unreachable" }
> {
  for (let tried = 0; tried < TRIES; tried += 1) {
    const asked = await ask()
    switch (asked.kind) {
      case "answered": {
        return read(asked)
      }
      case "unpaired": {
        return { kind: "unpaired" }
      }
      case "unreachable": {
        return { kind: "unreachable" }
      }
      case "busy": {
        await wait(WAIT_MS)
        break
      }
      default: {
        return assertNever(asked)
      }
    }
  }
  return { kind: "unreachable" }
}

const askHome = (of: Of | null): Promise<HomeReading> =>
  askWhileBusy(
    () => askKept(of),
    ({ answer, record }) => readKept(answer, record)
  )

const askReceipts = (): Promise<ReceiptsReading> =>
  askWhileBusy(askDeleted, ({ answer }) => readReceipts(answer))

async function readPhone(): Promise<PhoneRead> {
  const { notes, unread } = await recordingsOnPhone().catch(
    (error: unknown) => {
      reportFailure({
        port: "my data: this phone's recordings",
        error: toIntentError(error),
      })
      return { notes: [], unread: [] }
    }
  )
  const read = await Promise.all(
    notes.map(async ({ id, of, at, audio }): Promise<PhoneNote | null> => {
      const blob = await audio()
        // Ignored: a recording whose audio this phone can't read isn't
        // counted this time; the next open or drag down reads it again.
        .catch(() => null)
      if (blob === null) return null
      // Where every screen's row says it is (MIC3).
      const { place } = voiceKept(id)
      return {
        id,
        of,
        at,
        // IndexedDB hands back a handle whose size is known without its
        // bytes being read.
        bytes: blob.size,
        held: place === "home",
        going: place === "going",
      }
    })
  )
  return {
    notes: read.filter((note): note is PhoneNote => note !== null),
    unread,
  }
}

async function audioOf(id: string): Promise<Blob | null> {
  const { notes } = await recordingsOnPhone()
  const found = notes.find((note) => note.id === id)
  return found === undefined ? null : found.audio()
}

let myData: MyData | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneMyData(): MyData {
  myData ??= createMyData({
    askHome,
    readPhone,
    audioOf,
    player: audioPlayer,
  })
  return myData
}

/** How this phone lets go of its own copies of each kind home deleted. */
const LETS_GO: Readonly<
  Record<DeletableKind, (ids: ReadonlyArray<string>) => Promise<boolean>>
> = {
  studio: letGoDeleted,
}

let deleting: Deleting | null = null

/** Made on first use, so importing this module sends nothing. */
export function phoneDeleting(): Deleting {
  deleting ??= createDeleting({
    deleteNotes,
    letGo: (of, ids) => LETS_GO[of](ids),
    reread: () => {
      const data = phoneMyData()
      data.open(data.getSnapshot().of)
    },
  })
  return deleting
}

let receipts: Receipts | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneReceipts(): Receipts {
  receipts ??= createReceipts({ askHome: askReceipts })
  return receipts
}
