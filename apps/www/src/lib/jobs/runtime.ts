/**
 * The Jobs wing's runtime: it owns the async work around `step` (reading a
 * picked digest, a voice note's take, the push service's token) and decides
 * which late result is stale. Screens read `getSnapshot` and call the
 * methods below.
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import { assertNever } from "@some-ui/core-utils"
import { reportFailure, toIntentError } from "@some-ui/intent-kit"
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

import type { FormDraft, FormDrafts } from "./drafts"
import { draftRecordedBy, readDrafts, withDraft, writeDrafts } from "./drafts"
import type { Outgoing } from "./files"
import { decisionsFile, scoutsFile } from "./files"
import type { JobsRecordPort } from "./home"
import { deliveryView } from "./journey"
import type {
  Draft,
  JobsAction,
  JobsState,
  Outcome,
  PickRef,
  ScoutDraft,
  ShareKind,
} from "./model"
import { EMPTY, readOn, step } from "./model"
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
  /** Whether this phone can be told when a morning run is in (`./notice`). */
  notice: NoticeView
}

/** What the notice's control shows. */
export type NoticeView = {
  /** The control is shown: this build can ask, and has not found it can't. */
  readonly offered: boolean
  /** Waiting on Android's prompt, or the push service. */
  readonly asking: boolean
  /** Why the last ask came to nothing, in the person's terms, or null. */
  readonly why: "not-allowed" | "failed" | null
}

/** What asking the push service for this phone's token came to. */
export type NoticeAsked =
  | { readonly kind: "token"; readonly token: string }
  /** This build can't be told: the control is withdrawn. */
  | { readonly kind: "unavailable" }
  | { readonly kind: "not-allowed" }
  | { readonly kind: "failed" }

/** The push service, on the Android app only (`./notice-native`). */
export type NoticePort = {
  /** Asks for this install's token, with Android's permission first. */
  register: () => Promise<NoticeAsked>
}

export type JobsPorts = {
  storage: KeyedStorage
  audio: BlobShelf
  saving: (id: string, inFlight: boolean) => void
  isSaving: (id: string) => boolean
  startRecording: StartRecording
  now: () => Date
  /** The local calendar day of `at`, `YYYY-MM-DD`. */
  dayOf: (at: Date) => string
  newId: () => string
  /** The push service, where this build has one. */
  notice?: NoticePort
}

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
  /**
   * Records that I read `pick` through, once a local day; false when it was
   * already read today, or wasn't kept. Opening a pick does this unasked, so
   * a reading the phone can't keep says nothing.
   */
  read: (pick: PickRef) => boolean
  /** Keeps what `owner`'s form holds, or clears it with null. */
  draft: (owner: string, draft: FormDraft | null) => void
  /** Adds a scout, with an id of its own and the voice notes it names. */
  addScout: (scout: ScoutDraft, voice: ReadonlyArray<string>) => boolean
  /** Records what happened to an application, dated today. */
  addOutcome: (fingerprint: string, event: Outcome) => boolean
  /**
   * Takes back the outcome recorded as `outcomeId`; false when no standing
   * outcome has that id, or it wasn't kept.
   */
  withdrawOutcome: (outcomeId: string) => boolean
  startVoice: (owner: string) => void
  stopVoice: () => void
  leaveVoice: () => void
  /** Lets a draft's voice notes go; a note the record names stays. */
  dropVoice: (ids: ReadonlyArray<string>) => void
  /** Lets each voice note in `homeHolds` leave the phone (LG1). */
  letGo: (homeHolds: ReadonlySet<string>) => void
  /** Audio no note lists (the app closed mid-save). Best effort. */
  sweep: () => void
  /**
   * Turns the notice on or off. On asks the push service for this phone's
   * token; the next exchange with home files it (`./home`).
   */
  wantNotice: (on: boolean) => void
  /** The record one exchange with home reads and answers (`./home`). */
  keeping: JobsRecordPort
}

/** A note is a take of a soundbite's length. */
const LIMITS = { minMs: SOUNDBITE_MIN_MS, maxMs: SOUNDBITE_MAX_MS }

const IDLE: Importing = { kind: "idle" }

const DRAFT_NOT_KEPT =
  "This phone couldn’t keep what you typed, so it lasts only while Jobs stays open. Free some space."

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
  const listeners = new Set<() => void>()
  let notice: NoticeView = {
    offered: ports.notice !== undefined,
    asking: false,
    why: null,
  }
  /** The latest ask: an earlier one's answer is stale. */
  let asks = 0

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
      notice,
    }
  }
  let snapshot = snapshotNow()
  const publish = (): void => {
    snapshot = snapshotNow()
    for (const listener of listeners) listener()
  }
  note.subscribe(publish)

  /**
   * Applies `action`, keeping the result first; false if it changed nothing.
   * A `quiet` one neither raises nor clears a problem: nobody asked for it.
   */
  function commit(action: JobsAction, quiet = false): boolean {
    const next = step(state, action)
    if (next === state) return false
    if (readOnly || !writeStored(ports.storage, next)) {
      if (quiet) return false
      problem = readOnly
        ? "This phone can't read its jobs record, so it isn't changing it."
        : "This phone couldn't keep that. Free some space and try again."
      publish()
      return false
    }
    state = next
    if (!quiet) problem = null
    publish()
    return true
  }

  /**
   * Asks the push service for this phone's token. `quiet`: nobody pressed
   * anything, so a failure is not shown.
   */
  const askForToken = async (
    port: NoticePort,
    quiet: boolean
  ): Promise<void> => {
    asks += 1
    const mine = asks
    if (!quiet) {
      notice = { ...notice, asking: true, why: null }
      publish()
    }
    const asked = await port.register()
    if (mine !== asks) return
    notice = { ...notice, asking: false }
    switch (asked.kind) {
      case "token": {
        commit({ type: "notice-token", token: asked.token }, quiet)
        break
      }
      case "unavailable": {
        notice = { offered: false, asking: false, why: null }
        commit({ type: "notice-wanted", wanted: false }, true)
        break
      }
      case "not-allowed":
      case "failed": {
        if (!quiet) {
          notice = { ...notice, why: asked.kind }
          commit({ type: "notice-wanted", wanted: false }, true)
        }
        break
      }
      default: {
        assertNever(asked)
      }
    }
    publish()
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

  /**
   * The file of `kind` an exchange files with home now: what no file that
   * reached its road carried, and what a run missed besides
   * (`deliveryView`), so a file the run never read goes again.
   */
  const fileFor = (kind: ShareKind, at: Date): Outgoing => {
    const from = deliveryView(state, kind, at)
    return kind === "decisions"
      ? decisionsFile(from, ports.dayOf(at), at.toISOString())
      : scoutsFile(from, at)
  }

  // A token can change under the app (FCM rotates them): ask again on each
  // start while the notice is on, so home holds the current one.
  if (ports.notice !== undefined && state.home.notice.wanted) {
    void askForToken(ports.notice, true)
  }

  return {
    keeping: {
      state: () => state,
      answered(held, refused): void {
        commit({ type: "home-answered", held, refused })
      },
      restored: (events) => commit({ type: "restored", events }),
      fetched(digests, runs): void {
        const action: JobsAction = {
          type: "fetched",
          digests,
          ...(runs === undefined ? {} : { runs }),
          at: ports.now().toISOString(),
        }
        // Only that home answered, and what its runs did, copies of home's
        // that nobody asked for: quiet.
        commit(action, step(state, action).digests === state.digests)
      },
      outgoing: (kind) => fileFor(kind, ports.now()),
      // Home holds it, so it is shared and has arrived, in one change: a
      // record of one without the other would file it again. Both at one
      // instant (`./journey`).
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
              since: file.since,
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
      noticeFiled(token): void {
        commit({ type: "notice-filed", token }, true)
      },
      noticeRefused(): void {
        commit({ type: "notice-token", token: null }, true)
      },
    },
    wantNotice(on): void {
      if (!commit({ type: "notice-wanted", wanted: on }) && !on) return
      if (!on) {
        asks += 1
        notice = { ...notice, asking: false, why: null }
        publish()
        return
      }
      if (ports.notice !== undefined) void askForToken(ports.notice, false)
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
    read(pick): boolean {
      const today = ports.dayOf(ports.now())
      if (readOn(state, pick.day, pick.pickId, today, ports.dayOf)) return false
      return commit(
        { type: "record", event: { type: "read", ...pick }, stamp: stamp() },
        true
      )
    },
    draft: setDraft,
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
    withdrawOutcome: (outcomeId) =>
      commit({
        type: "record",
        event: { type: "outcome-withdrawn", outcomeId },
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
      // Ignored: audio that fails to go is named by no note, and `sweep`
      // clears it.
      ports.audio.remove(gone.map((n) => n.id)).catch(() => undefined)
    },
    letGo(homeHolds): void {
      const ids = state.voice.map((n) => n.id).filter((id) => homeHolds.has(id))
      // An entry the phone couldn't drop keeps its audio, so the voice lane
      // still finds it.
      if (ids.length === 0 || !commit({ type: "voice-held", ids }, true)) {
        return
      }
      // Ignored: audio no note lists is cleared by `sweep`.
      ports.audio.remove(ids).catch(() => undefined)
    },
    sweep(): void {
      ports.audio
        .ids()
        .then((stored) => {
          const listed = new Set(state.voice.map((n) => n.id))
          const orphans = stored.filter(
            (id) => !listed.has(id) && !ports.isSaving(id)
          )
          return ports.audio.remove(orphans)
        })
        .catch((error: unknown) => {
          reportFailure({
            port: "jobs voice sweep",
            error: toIntentError(error),
          })
        })
    },
  }
}
