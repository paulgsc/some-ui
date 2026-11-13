/**
 * My data (MY-DATA MD2, #2476): what you keep, where, how much and how it
 * grows, read only. `./model` is what the page shows, `./state` and
 * `./runtime` read it and play a recording, `./words` says it, and this
 * module wires the runtime to the phone: home through its read of what it
 * keeps, the record's count with it on the overview
 * (`lib/home-link/kept-read`, LA8), and this phone's recordings as
 * the voice lane lists them and says where each is kept
 * (`lib/home-link/voice-copy`'s `recordingsOnPhone` and `voiceKept`), and a
 * recording's audio from home when this phone let its own go
 * (`lib/home-link/voice-audio`, MD8). Phone-only
 * (`build.paths.ts`).
 *
 * Deleting a record home keeps (MD3, #2477) is `./deleting` and
 * `./deleting-runtime`; the Deleted page's receipts are `./receipts`.
 */
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { audioPlayer } from "@some-ui/voice-capture"

import { feedVideos } from "@/lib/call-videos"
import { deleteCallStep, deleteNotes } from "@/lib/home-link/delete-note"
import { askDeleted } from "@/lib/home-link/deleted-read"
import { askKept } from "@/lib/home-link/kept-read"
import { askAudio } from "@/lib/home-link/voice-audio"
import {
  letGoDeleted,
  recordingsOnPhone,
  voiceKept,
} from "@/lib/home-link/voice-copy"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import { studioKeeping } from "@/lib/studio-keeping"

import type { CallDeleting } from "./call-deleting-runtime"
import { createCallDeleting } from "./call-deleting-runtime"
import type { DeletableKind, ReceiptsReading } from "./deleting"
import { isDeletableKind, readReceipts } from "./deleting"
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

async function askHome(
  of: Of | null,
  note: string | null = null
): Promise<HomeReading> {
  const asked = await askWhileBusy(() => askKept(of, note))
  return asked.kind === "answered"
    ? readKept(asked.answer, asked.record)
    : asked
}

async function askReceipts(): Promise<ReceiptsReading> {
  const asked = await askWhileBusy(askDeleted)
  return asked.kind === "answered" ? readReceipts(asked.answer) : asked
}

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

/**
 * Recording `id`'s audio: this phone's copy, else home's, asked for once
 * (MD8; `lib/home-link/voice-audio`, which sends nothing but the id and
 * keeps nothing it gets). Away from home, or for a kind home gives no audio
 * back for, none.
 */
async function audioOf(id: string): Promise<Blob | null> {
  const { notes } = await recordingsOnPhone()
  const found = notes.find((note) => note.id === id)
  const here = found === undefined ? null : await found.audio()
  return here ?? askAudio(id)
}

/**
 * The Studio takes My data would offer to delete (MD4): those of home's
 * newest Studio recordings home marks deletable, once Studio's store is
 * handed in, as `offersDelete` decides it, from one read of what home
 * keeps of Studio's (`askHome`). Empty when home can't say; never rejects.
 * Studio's own list of what it keeps (`StudioRecords`) offers Delete… on
 * these, which opens My data on the take.
 */
export async function deletableStudioTakes(): Promise<ReadonlySet<string>> {
  const home = await askHome("studio")
  // This phone lets its own copy go only through Studio's store.
  if (
    home.kind !== "read" ||
    studioKeeping() === null ||
    !isDeletableKind("studio")
  ) {
    return new Set()
  }
  return new Set(
    (home.kept.notes ?? [])
      .filter((note) => note.deletable)
      .map((note) => note.id)
  )
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
      phoneMyData().refreshShown()
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

let callDeleting: CallDeleting | null = null

/**
 * My data's let-go of a feed's episode (ST38, FEED4), one per page load:
 * home's delete of the step (LA19), the phone's copy of the video once it
 * went, and the feed's episodes read again.
 */
export function phoneCallDeleting(): CallDeleting {
  callDeleting ??= createCallDeleting({
    deleteCallStep,
    forgetCopy: (feed, key) => feedVideos(feed).forget(key),
    reread: (feed) => {
      void feedVideos(feed).open()
    },
  })
  return callDeleting
}
