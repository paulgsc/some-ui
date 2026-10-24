/**
 * The Jobs wing's runtime: it owns the async work around `step` (reading a
 * picked digest, a voice note's take, the share sheet) and decides which late
 * result is stale. Screens read `getSnapshot` and call the methods below.
 */
import { parseDigest } from "@some-ui/job-desk"
import {
  SOUNDBITE_MAX_MS,
  SOUNDBITE_MIN_MS,
} from "@some-ui/soundbites/contract"
import type {
  BlobShelf,
  StartRecording,
  TakeView,
} from "@some-ui/voice-capture"
import {
  shelveTake,
  takeView,
  voiceNoteRuntime,
  voiceNoteSaid,
} from "@some-ui/voice-capture"

import type { SharedFile } from "@/lib/share-files"
import type { StorageAdapter } from "@/lib/tenant/storage"

import type { FormDraft, FormDrafts } from "./drafts"
import { draftRecordedBy, readDrafts, withDraft, writeDrafts } from "./drafts"
import type { Outgoing, OutgoingFile } from "./files"
import { decisionsFile, isFile, scoutsFile } from "./files"
import type { JobsRecordPort } from "./home"
import { deliveryView } from "./journey"
import type {
  Draft,
  JobsAction,
  JobsState,
  Outcome,
  ScoutDraft,
  ShareKind,
} from "./model"
import { EMPTY, hasArrived, releasedVoice, step, undecidedOf } from "./model"
import { openStored, writeStored } from "./stored"

/** Reading a picked file: nothing in hand, reading, or not a digest (and why). */
type Importing =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "rejected"; problem: string }

export type JobsSnapshot = {
  state: JobsState
  importing: Importing
  /** The storage could not be read: the record shows, and refuses changes. */
  readOnly: boolean
  /** The last change the phone refused to keep, said once. */
  problem: string | null
  /** What the pick forms hold that isn't kept yet (`./drafts`). */
  drafts: FormDrafts
  /** The voice note under way, and whose. */
  take: TakeView
  takeOwner: string | null
  said: string | null
}

type ShareDir = "job-decisions" | "job-scouts"

export type JobsPorts = {
  storage: StorageAdapter
  audio: BlobShelf
  saving: (id: string, inFlight: boolean) => void
  isSaving: (id: string) => boolean
  startRecording: StartRecording
  /** Opens the share sheet with `files`; throws when sharing failed. */
  share: (
    dir: ShareDir,
    title: string,
    files: ReadonlyArray<SharedFile>
  ) => Promise<"shared" | "cancelled">
  now: () => Date
  /** The local calendar day of `at`, `YYYY-MM-DD`. */
  dayOf: (at: Date) => string
  newId: () => string
}

type Shared =
  | { outcome: "shared"; shareId: string }
  /** The sheet sent the files but the phone could not note it: they stay pending. */
  | { outcome: "cancelled" | "nothing" | "unrecorded" }

export type JobsRuntime = {
  getSnapshot: () => JobsSnapshot
  subscribe: (listener: () => void) => () => void
  /** Reads `file` as a digest. A later pick wins over one still being read. */
  open: (file: Blob) => void
  /**
   * Adds an event to the record; false when it doesn't fit or wasn't kept.
   * Once kept, it clears the form draft it came from.
   */
  record: (event: Draft) => boolean
  /** Keeps what `owner`'s form holds, or clears it with null. */
  draft: (owner: string, draft: FormDraft | null) => void
  /**
   * Archives every pick of `day`'s digest with no decision yet, unreviewed;
   * false when there was none or the phone kept none.
   */
  archive: (day: string) => boolean
  /** Adds a scout, with an id of its own and the voice notes it names. */
  addScout: (scout: ScoutDraft, voice: ReadonlyArray<string>) => boolean
  /** Records what happened to an application, dated today. */
  addOutcome: (fingerprint: string, event: Outcome) => boolean
  startVoice: (owner: string) => void
  stopVoice: () => void
  leaveVoice: () => void
  /** Lets a draft's voice notes go; a note the record names stays. */
  dropVoice: (ids: ReadonlyArray<string>) => void
  /**
   * The file `kind`'s share sheet would send now, why it can't be shared,
   * or null when there's nothing new since the last share that arrived and
   * no run missed one.
   */
  outgoing: (kind: ShareKind) => Outgoing
  share: (kind: ShareKind) => Promise<Shared>
  /**
   * The person said share `shareId`'s files arrived: what it carried counts
   * as sent, and its audio leaves.
   */
  arrived: (shareId: string) => void
  /** Audio no note lists (the app closed mid-save). Best effort. */
  sweep: () => void
  /** The record one exchange with home reads and answers (`./home`). */
  keeping: JobsRecordPort
}

/** A note is a take of a soundbite's length. */
const LIMITS = { minMs: SOUNDBITE_MIN_MS, maxMs: SOUNDBITE_MAX_MS }

const IDLE: Importing = { kind: "idle" }

const DRAFT_NOT_KEPT =
  "This phone couldn’t keep what you typed, so it lasts only while Jobs stays open. Free some space."

const SHARES: Readonly<Record<ShareKind, { dir: ShareDir; title: string }>> = {
  decisions: { dir: "job-decisions", title: "Today's job decisions" },
  scouts: { dir: "job-scouts", title: "Jobs I found" },
}

export function createJobsRuntime(ports: JobsPorts): JobsRuntime {
  const opened = openStored(ports.storage)
  let state: JobsState = opened.kind === "kept" ? opened.state : EMPTY
  const readOnly = opened.kind === "unreadable"
  let importing: Importing = IDLE
  let problem: string | null = null
  const keptDrafts = readDrafts(ports.storage)
  let drafts = keptDrafts.drafts
  let takeOwner: string | null = null
  let picks = 0
  const sharing = new Set<ShareKind>()
  const listeners = new Set<() => void>()

  const note = voiceNoteRuntime(
    {
      startRecording: ports.startRecording,
      now: () => ports.now().getTime(),
      save: (take, _atMs, saved) => {
        const owner = takeOwner ?? "draft"
        const id = ports.newId()
        const entry = {
          id,
          mimeType: take.mimeType,
          durationMs: Math.round(take.durationMs),
          owner,
        }
        shelveTake(
          ports,
          id,
          take,
          () => commit({ type: "voice-kept", note: entry }),
          saved
        )
      },
    },
    LIMITS
  )

  const snapshotNow = (): JobsSnapshot => {
    const voice = note.getSnapshot()
    return {
      state,
      importing,
      readOnly,
      problem,
      drafts,
      take: takeView(voice),
      takeOwner: voice.kind === "idle" ? null : takeOwner,
      said: voiceNoteSaid(voice, false),
    }
  }
  let snapshot = snapshotNow()
  const publish = (): void => {
    snapshot = snapshotNow()
    for (const listener of listeners) listener()
  }
  note.subscribe(publish)

  /** Applies `action`, keeping the result first; false if it changed nothing. */
  function commit(action: JobsAction): boolean {
    const next = step(state, action)
    if (next === state) return false
    if (readOnly || !writeStored(ports.storage, next)) {
      problem = readOnly
        ? "This phone can't read its jobs record, so it isn't changing it."
        : "This phone couldn't keep that. Free some space and try again."
      publish()
      return false
    }
    state = next
    problem = null
    publish()
    return true
  }

  // A draft the phone can't keep still holds while the page is open, and
  // says so; clearing one that then comes back says nothing.
  const setDraft = (owner: string, draft: FormDraft | null): void => {
    const next = withDraft(drafts, owner, draft)
    if (next === drafts) return
    drafts = next
    const kept =
      !readOnly && keptDrafts.writable && writeDrafts(ports.storage, drafts)
    if (draft !== null) {
      if (!kept) problem = DRAFT_NOT_KEPT
      else if (problem === DRAFT_NOT_KEPT) problem = null
    }
    publish()
  }

  const stamp = (): { id: string; at: string } => ({
    id: ports.newId(),
    at: ports.now().toISOString(),
  })

  const read = async (file: Blob, pick: number): Promise<void> => {
    let text: string
    try {
      text = await file.text()
    } catch {
      text = ""
    }
    if (pick !== picks) return
    const parsed = parseDigest(text)
    importing = parsed.ok ? IDLE : { kind: "rejected", problem: parsed.problem }
    if (
      !parsed.ok ||
      !commit({
        type: "opened",
        digest: parsed.value,
        at: ports.now().toISOString(),
      })
    ) {
      publish()
    }
  }

  const fileFor = (kind: ShareKind, at: Date, from = state): Outgoing =>
    kind === "decisions"
      ? decisionsFile(from, ports.dayOf(at), at.toISOString())
      : scoutsFile(from, at)

  /**
   * The share sheet's file: what an exchange would file, and what a run
   * missed besides (`deliveryView`). A note already let go stays named in
   * it, but its audio is gone, so none goes beside it.
   */
  const sheetFile = (kind: ShareKind, at: Date): Outgoing => {
    const file = fileFor(kind, at, deliveryView(state, kind, at))
    if (!isFile(file)) return file
    const released = releasedVoice(state)
    return { ...file, voice: file.voice.filter((v) => !released.has(v.id)) }
  }

  const audioOf = async (
    file: OutgoingFile
  ): Promise<ReadonlyArray<SharedFile>> => {
    const blobs = await Promise.all(
      file.voice.map(({ id }) => ports.audio.get(id))
    )
    return file.voice.map(({ id, name }, i) => {
      const blob = blobs[i]
      if (!blob) throw new Error(`no audio for voice note ${id}`)
      return { name, data: blob }
    })
  }

  return {
    keeping: {
      state: () => state,
      answered(held, refused): void {
        commit({ type: "home-answered", held, refused })
      },
      restored: (events) => commit({ type: "restored", events }),
      fetched(digests): void {
        commit({
          type: "fetched",
          digests,
          at: ports.now().toISOString(),
        })
      },
      outgoing: (kind) => fileFor(kind, ports.now()),
      // Home holds it, so it is shared and has arrived, in one change: a
      // record of one without the other would offer the file again. Both
      // at one instant, which tells a filed share from a confirmed one
      // (`./journey`).
      filed(kind, file): boolean {
        const shared = stamp()
        return commit({
          type: "record-all",
          events: [
            {
              event: {
                type: "shared",
                kind,
                day: ports.dayOf(new Date(shared.at)),
                file: file.name,
                through: file.through,
                voice: [],
              },
              stamp: shared,
            },
            {
              event: { type: "arrived", shareId: shared.id },
              stamp: { id: ports.newId(), at: shared.at },
            },
          ],
        })
      },
      fileRefused(name): void {
        commit({ type: "file-refused", name })
      },
    },
    getSnapshot: () => snapshot,
    subscribe(listener): () => void {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
    open(file): void {
      picks += 1
      importing = { kind: "reading" }
      publish()
      void read(file, picks)
    },
    record(event): boolean {
      if (!commit({ type: "record", event, stamp: stamp() })) return false
      const owner = draftRecordedBy(event)
      if (owner !== null) setDraft(owner, null)
      return true
    },
    draft: setDraft,
    archive: (day) =>
      commit({
        type: "record-all",
        events: undecidedOf(state, day).map((pick) => ({
          event: {
            type: "archived",
            day,
            pickId: pick.id,
            fingerprint: pick.fingerprint,
          },
          stamp: stamp(),
        })),
      }),
    addScout: (scout, voice) =>
      commit({
        type: "record",
        event: {
          type: "scout",
          scout: { ...scout, id: `sc-${ports.newId().slice(0, 8)}` },
          voice,
        },
        stamp: stamp(),
      }),
    addOutcome: (fingerprint, event) =>
      commit({
        type: "record",
        event: {
          type: "outcome",
          fingerprint,
          event,
          on: ports.dayOf(ports.now()),
          note: "",
        },
        stamp: stamp(),
      }),
    startVoice(owner): void {
      if (note.getSnapshot().kind !== "idle") return
      takeOwner = owner
      note.start(null)
    },
    stopVoice: note.stop,
    leaveVoice: note.leave,
    dropVoice(ids): void {
      const before = state.voice
      if (!commit({ type: "voice-dropped", ids })) return
      const gone = before.filter((n) => !state.voice.includes(n))
      ports.audio.remove(gone.map((n) => n.id)).catch(() => undefined)
    },
    outgoing: (kind) => sheetFile(kind, ports.now()),
    async share(kind): Promise<Shared> {
      if (sharing.has(kind)) return { outcome: "cancelled" }
      const at = ports.now()
      const file = sheetFile(kind, at)
      if (!isFile(file)) return { outcome: "nothing" }
      sharing.add(kind)
      try {
        const audio = await audioOf(file)
        const { dir, title } = SHARES[kind]
        const result = await ports.share(dir, title, [
          { name: file.name, data: file.json },
          ...audio,
        ])
        if (result !== "shared") return { outcome: "cancelled" }
        const shareStamp = stamp()
        const noted = commit({
          type: "record",
          event: {
            type: "shared",
            kind,
            day: ports.dayOf(at),
            file: file.name,
            through: file.through,
            voice: file.voice.map(({ id }) => id),
          },
          stamp: shareStamp,
        })
        if (!noted) return { outcome: "unrecorded" }
        return { outcome: "shared", shareId: shareStamp.id }
      } finally {
        sharing.delete(kind)
      }
    },
    arrived(shareId): void {
      const share = state.log.find((e) => e.id === shareId)
      if (share?.type !== "shared" || hasArrived(state, shareId)) return
      if (
        !commit({
          type: "record",
          event: { type: "arrived", shareId },
          stamp: stamp(),
        })
      ) {
        return
      }
      ports.audio.remove([...releasedVoice(state)]).catch(() => undefined)
    },
    sweep(): void {
      ports.audio
        .ids()
        .then((stored) => {
          const listed = new Set(state.voice.map((n) => n.id))
          // A released note was let go; retry one whose removal failed or
          // was cut short.
          const released = releasedVoice(state)
          const orphans = stored.filter(
            (id) => (!listed.has(id) || released.has(id)) && !ports.isSaving(id)
          )
          return ports.audio.remove(orphans)
        })
        .catch(() => undefined)
    },
  }
}
