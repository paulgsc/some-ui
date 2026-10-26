/**
 * The record of voice notes on their way home (`../model`): each event from
 * every state it can meet, and the stored shape read back; and how a run
 * ends after a copy pass, for every note's end and every exchange's (LA14).
 */
import type { HomeExchanged } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type {
  CopyEnd,
  CopyPass,
  VoiceHomeState,
  VoiceOut,
} from "@/lib/voice-home/model"
import {
  INITIAL_VOICE_HOME,
  NO_PASS,
  NO_ROOM,
  parseVoiceHome,
  passWith,
  runEnd,
  settled,
  stepVoiceHome,
} from "@/lib/voice-home/model"

const NOTE: VoiceOut = {
  id: "n1",
  of: "reflection",
  ref: "session-7f2a",
  at: "2026-10-25T03:10:00.000Z",
  contentType: "audio/webm;codecs=opus",
}
const OTHER: VoiceOut = { ...NOTE, id: "n2" }

const copied = (state: VoiceHomeState, note: VoiceOut): VoiceHomeState =>
  stepVoiceHome(state, { kind: "copied", note })

describe("the record of voice notes on their way home", () => {
  it("copies a note once, oldest first, and a note with no room waits for it", () => {
    const roomless = stepVoiceHome(INITIAL_VOICE_HOME, {
      kind: "roomless",
      id: "n1",
    })
    expect(roomless.roomless).toEqual(["n1"])
    expect(stepVoiceHome(roomless, { kind: "roomless", id: "n1" })).toBe(
      roomless
    )
    expect(settled(roomless, "n1")).toBe(false)

    const one = copied(roomless, NOTE)
    expect(one).toEqual({ ...INITIAL_VOICE_HOME, waiting: [NOTE] })
    expect(copied(one, { ...NOTE, ref: "other" })).toBe(one)
    expect(copied(one, OTHER).waiting).toEqual([NOTE, OTHER])
    expect(stepVoiceHome(one, { kind: "roomless", id: "n1" })).toBe(one)
  })

  it("moves a waiting note to held or refused, once, and never copies it again", () => {
    const two = copied(copied(INITIAL_VOICE_HOME, NOTE), OTHER)
    const held = stepVoiceHome(two, { kind: "held", id: "n1" })
    expect(held.waiting).toEqual([OTHER])
    expect(held.held).toEqual(["n1"])
    expect(stepVoiceHome(held, { kind: "held", id: "n1" })).toBe(held)
    expect(copied(held, NOTE)).toBe(held)

    const refused = stepVoiceHome(held, {
      kind: "refused",
      id: "n2",
      why: "home holds another recording under its name",
    })
    expect(refused).toEqual({
      waiting: [],
      held: ["n1"],
      refused: [
        { id: "n2", why: "home holds another recording under its name" },
      ],
      roomless: [],
    })
    expect(settled(refused, "n2")).toBe(true)
    expect(copied(refused, OTHER)).toBe(refused)
    expect(
      stepVoiceHome(INITIAL_VOICE_HOME, { kind: "refused", id: "n9", why: "x" })
    ).toBe(INITIAL_VOICE_HOME)
  })

  it("reads back what it stored, and nothing else", () => {
    const state = stepVoiceHome(copied(INITIAL_VOICE_HOME, NOTE), {
      kind: "roomless",
      id: "n3",
    })
    expect(parseVoiceHome(JSON.stringify(state))).toEqual(state)
    for (const raw of [
      "not json",
      "[]",
      JSON.stringify({ ...state, held: [1] }),
      JSON.stringify({ ...state, waiting: [{ ...NOTE, of: "diary" }] }),
      JSON.stringify({ ...state, refused: [{ id: "n" }] }),
      JSON.stringify({ waiting: [], held: [], refused: [] }),
    ]) {
      expect([raw, parseVoiceHome(raw)]).toEqual([raw, null])
    }
  })
})

describe("how a run ends after a copy pass (LA14)", () => {
  const ENDS: ReadonlyArray<CopyEnd | "fault"> = [
    "copied",
    "roomless",
    "unkept",
    "fault",
  ]
  const EXCHANGED: ReadonlyArray<HomeExchanged> = [
    { kind: "synced" },
    { kind: "forgotten" },
    { kind: "failed", why: "a voice note: home answered 500" },
  ]
  const passOf = (ends: ReadonlyArray<CopyEnd | "fault">): CopyPass =>
    ends.reduce(passWith, NO_PASS)

  it("fails a run that sent everything only for a note it could still copy, the phone's fault first", () => {
    // Every pair of note ends, each with a note gone or not.
    for (const a of ENDS) {
      for (const b of ENDS) {
        for (const gone of [new Set<string>(), new Set(["g1"])]) {
          const pass = { ...passOf([a, b]), gone }
          const ends = [a, b]
          const expected: HomeExchanged = ends.some(
            (end) => end === "unkept" || end === "fault"
          )
            ? { kind: "failed", why: "fault" }
            : ends.includes("roomless")
              ? { kind: "failed", why: NO_ROOM }
              : { kind: "synced" }
          expect(runEnd(pass, { kind: "synced" })).toEqual(expected)
          // What home said wins over what the phone could not copy.
          for (const exchanged of EXCHANGED.slice(1)) {
            expect(runEnd(pass, exchanged)).toBe(exchanged)
          }
        }
      }
    }
  })

  it("fails nothing for a note whose audio is gone", () => {
    expect(
      runEnd({ ...NO_PASS, gone: new Set(["g1", "g2"]) }, { kind: "synced" })
    ).toEqual({ kind: "synced" })
  })
})
