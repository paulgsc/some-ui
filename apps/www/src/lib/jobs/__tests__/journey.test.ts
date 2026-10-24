/**
 * JB2's proof (`lib/jobs/journey`): each state of the shared union is read
 * off a record built to reach it, over the promise's Family: the road (home
 * without a tap, the share sheet, home refused, a missed run), whether Jobs
 * is kept on home, and timing (filed before the person looks, a run going
 * by, after a relaunch). `in-mailbox` and `mailbox-refused` need home to say
 * what it handed on (S0), so no record on the phone reaches them yet.
 */
import type { Digest } from "@some-ui/job-desk"
import { describe, expect, it } from "vitest"

import type { Outgoing, OutgoingFile } from "@/lib/jobs/files"
import { decisionsFile, isFile, scoutsFile } from "@/lib/jobs/files"
import type { JourneyContext } from "@/lib/jobs/journey"
import {
  deliveryView,
  eventJourney,
  HANDOVER_MS,
  kindJourney,
  lastLetGo,
  unconfirmedShare,
} from "@/lib/jobs/journey"
import type { Draft, JobsState, ShareKind } from "@/lib/jobs/model"
import { DIGESTS_KEPT, EMPTY, step } from "@/lib/jobs/model"
import { createJobsRuntime } from "@/lib/jobs/runtime"
import type { JourneyId } from "@/lib/journey"
import { JOURNEY_IDS } from "@/lib/journey"

import { digest, OPENED_AT, ports } from "./fixture"

const DAY = "2026-10-18"
const D = digest(DAY)
const [SW, AD] = D.picks
/** When the tests' events happen, on `DAY`. */
const NOON = "2026-10-18T19:00:00.000Z"
/** The next morning's run, made at 7:52 Pacific (`digest`). */
const NEXT = "2026-10-19"

let n = 0
const stamp = (at: string): { id: string; at: string } => {
  n += 1
  return { id: `e${n}`, at }
}

function record(state: JobsState, event: Draft, at = NOON): JobsState {
  const next = step(state, { type: "record", event, stamp: stamp(at) })
  expect(next).not.toBe(state)
  return next
}

const taken = (p = SW): Draft => ({
  type: "taken",
  day: DAY,
  pickId: p.id,
  fingerprint: p.fingerprint,
})

const opened = step(EMPTY, { type: "opened", digest: D, at: OPENED_AT })

function outgoing(state: JobsState, kind: ShareKind, at = NOON): Outgoing {
  return kind === "decisions"
    ? decisionsFile(state, DAY, at)
    : scoutsFile(state, new Date(at))
}

function fileOf(state: JobsState, kind: ShareKind = "decisions"): OutgoingFile {
  const file = outgoing(state, kind)
  if (!isFile(file)) throw new Error(`no ${kind} file`)
  return file
}

function context(state: JobsState, kept = true): JourneyContext {
  return { state, kept, outgoing: (kind) => outgoing(state, kind) }
}

const idOf = (state: JobsState, kept = true): JourneyId | null =>
  kindJourney(context(state, kept), "decisions")?.id ?? null

/** Shared by the sheet at `at`, not yet confirmed; and its id. */
function share(
  state: JobsState,
  at = NOON,
  kind: ShareKind = "decisions",
  from = state
): { state: JobsState; id: string } {
  const file = fileOf(from, kind)
  const s = stamp(at)
  const next = step(state, {
    type: "record",
    event: {
      type: "shared",
      kind,
      day: DAY,
      file: file.name,
      through: file.through,
      voice: file.voice.map((v) => v.id),
    },
    stamp: s,
  })
  return { state: next, id: s.id }
}

/** As an exchange files it with home: shared and arrived at one instant. */
function fileWithHome(
  state: JobsState,
  at = NOON,
  kind: ShareKind = "decisions"
): { state: JobsState; name: string } {
  const file = fileOf(state, kind)
  const s = stamp(at)
  const next = step(state, {
    type: "record-all",
    events: [
      {
        event: {
          type: "shared",
          kind,
          day: DAY,
          file: file.name,
          through: file.through,
          voice: [],
        },
        stamp: s,
      },
      { event: { type: "arrived", shareId: s.id }, stamp: stamp(at) },
    ],
  })
  return { state: next, name: file.name }
}

/** A run's digest, taken in from home at `cameAt`, reading `read`. */
function run(
  state: JobsState,
  day: string,
  read: ReadonlyArray<string>,
  cameAt: string,
  createdAt = `${day}T14:52:00Z`
): JobsState {
  const d: Digest = { ...digest(day), createdAt, read: [...read] }
  return step(state, { type: "fetched", digests: [d], at: cameAt })
}

const later = (iso: string, ms: number): string =>
  new Date(Date.parse(iso) + ms).toISOString()

describe("JB2: a file waiting to leave the phone", () => {
  it("is on the phone, kept on home: home takes it without a tap", () => {
    const state = record(opened, taken())
    expect(idOf(state)).toBe("on-phone")
    expect(eventJourney(context(state), state.log.length - 1)?.id).toBe(
      "on-phone"
    )
  })

  it("goes by the share sheet when Jobs isn't kept on home", () => {
    const state = record(opened, taken())
    expect(kindJourney(context(state, false), "decisions")).toMatchObject({
      id: "needs-sheet",
      why: "not-kept",
    })
  })

  it("goes by the share sheet when a voice note rides along", () => {
    let state = step(opened, {
      type: "voice-kept",
      note: { id: "v1", mimeType: "audio/webm", durationMs: 4000, owner: "x" },
    })
    state = record(state, {
      type: "passed",
      day: DAY,
      pickId: AD.id,
      fingerprint: AD.fingerprint,
      reasons: [],
      note: "",
      voice: ["v1"],
    })
    expect(kindJourney(context(state), "decisions")).toMatchObject({
      id: "needs-sheet",
      why: "voice",
    })
  })

  it("waits for the sheet once home wouldn't take it", () => {
    const state = record(opened, taken())
    const refused = step(state, {
      type: "file-refused",
      name: fileOf(state).name,
    })
    expect(idOf(refused)).toBe("home-refused")
  })

  it("is shared, not confirmed, until the person says it arrived", () => {
    const shared = share(record(opened, taken()))
    expect(idOf(shared.state)).toBe("sheet-unconfirmed")
    expect(unconfirmedShare(shared.state, "decisions")?.id).toBe(shared.id)
    // Said once the sheet has closed: never the instant of the share.
    const arrived = record(
      shared.state,
      { type: "arrived", shareId: shared.id },
      later(NOON, 20_000)
    )
    expect(kindJourney(context(arrived), "decisions")).toMatchObject({
      id: "in-drive",
      via: "drive",
    })
    expect(unconfirmedShare(arrived, "decisions")).toBeNull()
  })

  it("says nothing before anything was offered", () => {
    expect(idOf(opened)).toBeNull()
  })
})

describe("JB2: a file home took without a tap", () => {
  const filed = fileWithHome(record(opened, taken()))

  it("says home has it, since it was filed", () => {
    expect(kindJourney(context(filed.state), "decisions")).toEqual({
      id: "with-home",
      via: "home",
      since: NOON,
      runDay: null,
      why: null,
    })
  })

  it("is read once a run names it, by home's road", () => {
    const state = run(filed.state, NEXT, [filed.name], "2026-10-19T16:00:00Z")
    expect(kindJourney(context(state), "decisions")).toMatchObject({
      id: "read",
      via: "home",
      runDay: NEXT,
    })
  })

  it("isn't missed by a run made before home could hand it on", () => {
    const state = run(
      filed.state,
      NEXT,
      [],
      "2026-10-19T16:00:00Z",
      later(NOON, HANDOVER_MS - 60_000)
    )
    expect(idOf(state)).toBe("with-home")
  })

  it("turns red when a run went by without reading it", () => {
    const state = run(filed.state, NEXT, [], "2026-10-19T16:00:00Z")
    expect(kindJourney(context(state), "decisions")).toEqual({
      id: "missed-run",
      via: "home",
      since: NOON,
      runDay: NEXT,
      why: null,
    })
  })

  it("is shared to Drive again whole once missed, and then counts as in Drive", () => {
    const missed = run(filed.state, NEXT, [], "2026-10-19T16:00:00Z")
    expect(outgoing(missed, "decisions")).toBeNull()
    const view = deliveryView(
      missed,
      "decisions",
      new Date("2026-10-19T17:00:00Z")
    )
    const again = fileOf(view)
    expect(JSON.parse(again.json).picks).toMatchObject([{ pickId: SW.id }])

    const resent = share(missed, "2026-10-19T17:00:00.000Z", "decisions", view)
    const arrived = record(
      resent.state,
      { type: "arrived", shareId: resent.id },
      "2026-10-19T17:01:00.000Z"
    )
    expect(kindJourney(context(arrived), "decisions")?.id).toBe("in-drive")
    expect(
      deliveryView(arrived, "decisions", new Date("2026-10-19T18:00:00Z"))
    ).toBe(arrived)
    const decision = arrived.log.findIndex((e) => e.type === "taken")
    expect(eventJourney(context(arrived), decision)?.id).toBe("in-drive")
  })
})

describe("JB2: one event's file", () => {
  it("follows a scout from the phone to the run", () => {
    let state = record(opened, {
      type: "scout",
      scout: {
        id: "sc-1",
        url: "https://example.org/job",
        title: "SDET",
        why: "",
        postingText: null,
        track: "software",
        family: null,
      },
      voice: [],
    })
    const index = state.log.length - 1
    expect(eventJourney(context(state), index)?.id).toBe("on-phone")
    const filed = fileWithHome(state, NOON, "scouts")
    state = filed.state
    expect(eventJourney(context(state), index)?.id).toBe("with-home")
    state = run(state, NEXT, [filed.name], "2026-10-19T16:00:00Z")
    expect(eventJourney(context(state), index)).toMatchObject({
      id: "read",
      runDay: NEXT,
    })
  })

  it("names the picks let go last, together", () => {
    let state = record(opened, taken())
    state = step(state, {
      type: "record-all",
      events: [SW, AD].map((p) => ({
        event: {
          type: "archived",
          day: DAY,
          pickId: p.id,
          fingerprint: p.fingerprint,
        },
        stamp: stamp("2026-10-18T19:30:00.000Z"),
      })),
    })
    expect(lastLetGo(state)).toMatchObject({
      at: "2026-10-18T19:30:00.000Z",
      count: 2,
    })
    expect(lastLetGo(opened)).toBeNull()
  })

  it("says nothing of a share older than the digests the phone keeps", () => {
    let state = fileWithHome(record(opened, taken())).state
    for (let i = 0; i < DIGESTS_KEPT; i += 1) {
      const day = later(`${NEXT}T12:00:00Z`, i * 86_400_000).slice(0, 10)
      state = run(state, day, [], `${day}T16:00:00Z`)
    }
    const decision = state.log.findIndex((e) => e.type === "taken")
    expect(eventJourney(context(state), decision)).toBeNull()
  })
})

describe("JB2: the runtime", () => {
  it("files with home at one instant, and says so after a relaunch", () => {
    const at = new Date("2026-10-18T22:00:00Z")
    const p = ports({ now: () => at })
    const jobs = createJobsRuntime(p)
    jobs.keeping.fetched([D])
    expect(jobs.record(taken())).toBe(true)
    const file = jobs.keeping.outgoing("decisions")
    if (!isFile(file)) throw new Error("no decisions file")
    expect(jobs.keeping.filed("decisions", file)).toBe(true)

    const again = createJobsRuntime({ ...p, storage: p.storage })
    const { state } = again.getSnapshot()
    expect(
      kindJourney(
        { state, kept: true, outgoing: again.keeping.outgoing },
        "decisions"
      )
    ).toMatchObject({ id: "with-home", since: at.toISOString() })
    expect(again.outgoing("decisions")).toBeNull()
  })
})

describe("JB2: the union", () => {
  it("is reached by the phone's record, but for what needs home's word", () => {
    const reached: Array<JourneyId> = [
      "on-phone",
      "with-home",
      "read",
      "missed-run",
      "home-refused",
      "needs-sheet",
      "sheet-unconfirmed",
      "in-drive",
    ]
    expect(new Set([...reached, "in-mailbox", "mailbox-refused"])).toEqual(
      new Set(JOURNEY_IDS)
    )
  })
})
