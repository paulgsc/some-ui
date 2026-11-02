/**
 * My data (MY-DATA MD2, #2476): what you keep, where, how much and how it
 * grows, read only. `./model` is what the page shows, `./state` and
 * `./runtime` read it and play a recording, `./words` says it, and this
 * module wires the runtime to the phone: home through its read of what it
 * keeps (`lib/home-link/kept-read`, LA8), and this phone's recordings as
 * the voice lane lists them and says where each is kept
 * (`lib/home-link/voice-copy`'s `recordingsOnPhone` and `voiceKept`). Phone-only
 * (`build.paths.ts`).
 */
import { assertNever } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
import { audioPlayer } from "@some-ui/voice-capture"

import { askKept } from "@/lib/home-link/kept-read"
import { recordingsOnPhone, voiceKept } from "@/lib/home-link/voice-copy"

import type { HomeReading, Of, PhoneNote, PhoneRead } from "./model"
import { readKept } from "./model"
import type { MyData } from "./runtime"
import { createMyData } from "./runtime"

export type { KindItem, Of, Overview, Where } from "./model"
export { isKind, kindOf, overviewOf, WHERE_ORDER } from "./model"
export type { MyData } from "./runtime"
export type { MyDataState } from "./state"

/** How often a read waits for the link to be free: it takes one run at a time, and a drag down drains every lane in turn (PULL3). */
const TRIES = 10
const WAIT_MS = 1_000

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

async function askHome(of: Of | null): Promise<HomeReading> {
  for (let tried = 0; tried < TRIES; tried += 1) {
    const asked = await askKept(of)
    switch (asked.kind) {
      case "answered": {
        return readKept(asked.answer)
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
