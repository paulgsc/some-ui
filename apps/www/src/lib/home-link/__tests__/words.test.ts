/**
 * Each lane's sharing words (LA14, LA15), Settings' readout of what is kept
 * on home, the clear, and Korean's look at the routine's files: each state
 * reads as what is kept where and what waits, and none of them names the
 * machinery behind it.
 */
import { describe, expect, it } from "vitest"

import type { ClearEnd } from "@/lib/home-link/clear"
import type { KeptRun, KeptState } from "@/lib/home-link/kept-model"
import { INITIAL_KEPT } from "@/lib/home-link/kept-model"
import type { LetGoEnd } from "@/lib/home-link/study-let-go"
import type { LaneFacts } from "@/lib/home-link/words"
import * as words from "@/lib/home-link/words"
import { CLEAR, laneView, lastLook, LET_GO, WORDS } from "@/lib/home-link/words"
import { HOW_ORDER, MARK_WORDS, WHERE_ORDER } from "@/lib/sharing-marks"

import { MACHINERY } from "./machinery"

const runs: Array<KeptState> = [
  INITIAL_KEPT,
  { ...INITIAL_KEPT, running: true },
  ...(
    [
      { kind: "synced", at: 1 },
      { kind: "unreachable", at: 1 },
      { kind: "stopped" },
      { kind: "busy" },
      { kind: "unpaired" },
      { kind: "forgotten" },
      { kind: "failed", why: "busy" },
      { kind: "failed", why: "full" },
      { kind: "failed", why: "refused" },
      { kind: "failed", why: "fault" },
      { kind: "failed", why: "room" },
      { kind: "failed", why: "an entry: home answered 500" },
    ] satisfies Array<KeptRun>
  ).map((last) => ({ ...INITIAL_KEPT, last })),
]

const facts = (over: Partial<LaneFacts> = {}): LaneFacts => ({
  known: true,
  paired: false,
  held: {},
  refused: {},
  waiting: 0,
  run: INITIAL_KEPT,
  hidden: 0,
  pulled: true,
  ...over,
})

function every(): Array<LaneFacts> {
  const all: Array<LaneFacts> = []
  for (const paired of [false, true]) {
    for (const held of [{}, { sessions: 3, shelf: 1, jobs: 4 }]) {
      for (const run of runs) {
        all.push(
          facts({
            known: run !== INITIAL_KEPT,
            paired,
            held,
            refused: { shelf: 2, aph: 1, jobs: 1 },
            waiting: 3,
            run,
            hidden: 1,
            pulled: false,
          })
        )
      }
    }
  }
  return all
}

/** What a word-making function says of 2 and a host; nothing for one that takes more. */
function saidOf(fn: unknown): Array<string> {
  if (typeof fn !== "function") return []
  try {
    const said: unknown = fn(2, "home.example")
    return typeof said === "string" ? [said] : []
  } catch {
    return []
  }
}

/** Every string in `value`, and what each of its counting words says of 2. */
function stringsOf(value: unknown): Array<string> {
  if (typeof value === "string") return [value]
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((v: unknown) =>
      typeof v === "function" ? saidOf(v) : stringsOf(v)
    )
  }
  return []
}

describe("each lane's sharing words", () => {
  it("never name the machinery", () => {
    const said = Object.values(WORDS).flatMap((lane) =>
      every().flatMap((f) => {
        const view = laneView(lane, f)
        return [
          view.word,
          view.line,
          ...view.rows.map((row) => row.text),
          ...view.notes,
        ]
      })
    )
    // The sharing marks' words live outside the link (`lib/sharing-marks`).
    const fixed = [
      ...[...Object.values(words), MARK_WORDS].flatMap(stringsOf),
      ...[1, 2].flatMap((gone) => words.unsentLines({ gone })),
    ]

    const named = [...said, ...fixed].filter((text) => MACHINERY.test(text))
    expect(fixed.length).toBeGreaterThan(30)
    expect(named).toEqual([])
    // The pattern is not vacuous: each of these must match.
    for (const old of [
      "Last sync: 10:42",
      "home answered 429",
      "Reads from home.lan",
      "Until home.lan answers, this shows only what this phone hasn't sent.",
    ]) {
      expect(MACHINERY.test(old)).toBe(true)
    }
  })

  it("says phone only until paired, and that nothing waits for a pairing", () => {
    const view = laneView(WORDS.practice, facts({ waiting: 2 }))
    expect(view).toMatchObject({ where: "phone", how: null })
    expect(view.line).toContain("Pair this phone with home")
    expect(view.rows.map((row) => row.text)).toEqual([
      "Only on this phone",
      "Only on this phone",
      "Only on this phone",
      "Only on this phone",
    ])
  })

  it("says partly on home once sent and not paired now", () => {
    const view = laneView(
      WORDS.practice,
      facts({ held: { sessions: 3, shelf: 0 } })
    )
    expect(view).toMatchObject({ where: "partly", how: null })
    expect(view.rows[0]?.text).toBe("3 sessions on home · new ones stay here")
  })

  it("says on home, and how much, when paired and nothing waits", () => {
    const view = laneView(
      WORDS.practice,
      facts({
        paired: true,
        held: { sessions: 3, shelf: 1, reflections: 4, prompts: 2 },
        refused: { shelf: 2 },
        run: { ...INITIAL_KEPT, last: { kind: "synced", at: 1 } },
      })
    )
    expect(view).toMatchObject({
      where: "kept",
      how: "current",
      word: "On home",
    })
    expect(view.rows.map((row) => row.text)).toEqual([
      "3 sessions on home",
      "1 kept item on home · 2 kept items home didn't take",
      "4 written reflections on home",
      "2 asks for the next scene on home",
    ])
  })

  it("says kept on home, with nothing to tell, before the first send", () => {
    const view = laneView(
      WORDS.jobs,
      facts({ paired: true, held: { jobs: 0 } })
    )
    expect(view).toMatchObject({
      where: "kept",
      how: null,
      word: "Kept on home",
    })
    expect(view.rows[0]?.text).toBe("Nothing on home yet")
  })

  it("says a fault on this phone as the phone's, not home's", () => {
    const fault = facts({
      paired: true,
      run: { ...INITIAL_KEPT, last: { kind: "failed", why: "fault" } },
    })
    expect(laneView(WORDS.jobs, fault)).toMatchObject({
      where: "kept",
      how: "fault",
      word: "Didn't go",
    })
    expect(laneView(WORDS.jobs, fault).line).toMatch(
      /^Something on this phone went wrong\./
    )
  })

  it("says a voice note this phone had no room or failed to copy as the phone's, with what waits (LA14)", () => {
    const ran = (why: string, waiting: number): LaneFacts =>
      facts({
        paired: true,
        waiting,
        run: { ...INITIAL_KEPT, last: { kind: "failed", why } },
      })
    expect(laneView(WORDS.voice, ran("room", 2))).toMatchObject({
      where: "kept",
      how: "no-room",
      word: "No room",
      line: "This phone has no room left for copies home doesn't have yet. 2 voice notes wait on this phone and go next time.",
    })
    expect(laneView(WORDS.voice, ran("fault", 1)).line).toBe(
      "Something on this phone went wrong. 1 voice note waits on this phone and goes next time."
    )
    expect(
      laneView(WORDS.voice, facts({ paired: true, waiting: 1 })).line
    ).toBe(
      "1 voice note waits on this phone. It goes to home while the app is open."
    )
  })

  it("says home was busy, with what waits, for every lane", () => {
    const busy = facts({
      paired: true,
      waiting: 2,
      run: { ...INITIAL_KEPT, last: { kind: "failed", why: "busy" } },
    })
    expect(laneView(WORDS.practice, busy)).toMatchObject({
      where: "kept",
      how: "busy",
      word: "Home busy",
      line: "Home is busy right now. 2 sessions, reflections and asks wait on this phone and go next time.",
    })
    expect(laneView(WORDS.aph, busy).line).toBe(
      "Home is busy right now. 2 changes wait on this phone and go next time."
    )
  })

  it("says what aph holds aside, and what it shows before home answers", () => {
    const view = laneView(
      WORDS.aph,
      facts({ paired: true, hidden: 2, pulled: false })
    )
    expect(view.notes).toEqual([
      "2 changes waiting here clash with home's record and aren't shown.",
      "Until home answers, this shows only what this phone hasn't sent yet.",
    ])
  })
})

describe("the clear's words", () => {
  it("says each end in the person's terms", () => {
    const ends: Array<ClearEnd> = [
      { kind: "cleared", freed: 2, kept: 0 },
      { kind: "cleared", freed: 1, kept: 1 },
      { kind: "cleared", freed: 0, kept: 2 },
      { kind: "nothing" },
      { kind: "unreachable" },
      { kind: "forgotten" },
      { kind: "busy" },
      { kind: "stopped" },
      { kind: "not-cleared", error: new Error("locked") },
    ]
    const lines = ends.map((end) => CLEAR.ended(end, "home.example"))
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines[1]).toBe(
      "Cleared 1 finished session from this phone. 1 stays here: home.example doesn't hold it as it is yet."
    )
    expect(lines[2]).toBe(
      "Nothing left this phone. 2 stay here: home.example doesn't hold them as they are yet."
    )
    // The sweep above can't call `ended` with an end: it says these here.
    expect(lines.filter((line) => MACHINERY.test(line))).toEqual([])
  })
})

describe("the study list's Let it go", () => {
  it("says each end in the person's terms, and what the confirm promises", () => {
    const ends: Array<LetGoEnd> = [
      { kind: "kept-home" },
      { kind: "deleted" },
      { kind: "missing" },
      { kind: "not-held" },
      { kind: "changed" },
      { kind: "unreachable" },
      { kind: "forgotten" },
      { kind: "busy" },
      { kind: "phone-busy" },
      { kind: "stopped" },
      { kind: "refused", error: new Error("500") },
      { kind: "unpaired" },
      { kind: "unreadable" },
      { kind: "not-let-go", held: true, error: new Error("locked") },
      { kind: "not-let-go", held: false, error: new Error("locked") },
    ]
    const lines = ends.map((end) => LET_GO.ended(end, "home.example"))
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines[0]).toBe("Gone from this phone. home.example keeps it.")
    // Whose busy it is: home's answer, or this phone's own sending.
    expect(lines[7]).toBe(
      "home.example is busy just now. Try again in a minute; it stays on this phone."
    )
    expect(lines[8]).toBe(
      "This phone is busy sending to home.example. Try again in a minute; it stays on this phone."
    )
    expect(lines[12]).toBe(
      "This phone couldn't read its pairing with home just now, so it stays here. Try again."
    )
    // Every end but the two that left says the session is still here.
    expect(
      lines
        .filter((_, i) => i > 2)
        .every((line) => /stays|still here/.test(line))
    ).toBe(true)
    const asked = [
      LET_GO.question("Evening reading", "home", "home.example"),
      LET_GO.question("Evening reading", "phone-only", "home"),
    ]
    expect(asked).toEqual([
      '"Evening reading" leaves this phone, and home.example keeps it. If home.example can\'t, it stays here.',
      '"Evening reading" leaves this phone, and can\'t be brought back.',
    ])
    // The phone-full offer asks the same let-go in its own words (PF1); the
    // host, "home" while the pairing is unsure, never opens a sentence.
    const offered = [
      LET_GO.room.question(
        "Evening reading",
        "9/1/2026",
        "home",
        "home.example"
      ),
      LET_GO.room.question("Evening reading", "9/1/2026", "home", "home"),
      LET_GO.room.question("Evening reading", "9/1/2026", "phone-only", "home"),
    ]
    expect(offered).toEqual([
      "Remove “Evening reading” (finished 9/1/2026) to make room? It leaves this phone, and home.example keeps it. If home.example can't, it stays here.",
      "Remove “Evening reading” (finished 9/1/2026) to make room? It leaves this phone, and home keeps it. If home can't, it stays here.",
      "Remove “Evening reading” (finished 9/1/2026) to make room? It leaves this phone, and can't be brought back.",
    ])
    expect(offered.filter((line) => /(^|[.?!] )home/.test(line))).toEqual([])
    expect(
      [
        ...lines,
        ...asked,
        ...offered,
        LET_GO.working("home.example"),
        LET_GO.room.working,
      ].filter((line) => MACHINERY.test(line))
    ).toEqual([])
  })
})

describe("the routine's files in Korean", () => {
  it("says every look in the person's terms", () => {
    const looks = [
      lastLook(null),
      ...(["read", "busy", "unreachable", "forgotten", "failed"] as const).map(
        (kind) => lastLook({ kind, at: 1 }, () => "18 Oct, 10:42")
      ),
    ]
    expect(new Set(looks).size).toBe(looks.length)
    expect(lastLook({ kind: "read", at: 1 }, () => "18 Oct, 10:42")).toBe(
      "Last looked at home 18 Oct, 10:42."
    )
  })

  it("gives every state of the mark its own pair of marks, and every mark a state", () => {
    const last = (run: KeptRun): KeptState => ({ ...INITIAL_KEPT, last: run })
    const kept = (run: KeptState, waiting = 0): LaneFacts =>
      facts({ paired: true, waiting, run })
    // One of each branch `laneView` can take.
    const states: ReadonlyArray<LaneFacts> = [
      facts({ known: false }),
      facts(),
      facts({ held: { aph: 3 } }),
      kept(INITIAL_KEPT),
      kept(last({ kind: "synced", at: 1 })),
      kept(INITIAL_KEPT, 2),
      kept({ ...INITIAL_KEPT, running: true }),
      kept(last({ kind: "forgotten" })),
      kept(last({ kind: "unreachable", at: 1 })),
      kept(last({ kind: "unpaired" })),
      kept(last({ kind: "failed", why: "busy" })),
      kept(last({ kind: "failed", why: "full" })),
      kept(last({ kind: "failed", why: "room" })),
      kept(last({ kind: "failed", why: "refused" })),
      kept(last({ kind: "failed", why: "fault" })),
      kept(last({ kind: "failed", why: "an entry" })),
    ]
    const views = states.map((f) => laneView(WORDS.aph, f))
    const marks = views.map((v) => `${v.where} ${v.how ?? "-"}`)
    expect(new Set(marks).size).toBe(states.length)
    expect(new Set(views.map((v) => v.line)).size).toBe(states.length)
    expect(new Set(views.map((v) => v.where))).toEqual(new Set(WHERE_ORDER))
    expect(new Set(views.flatMap((v) => v.how ?? []))).toEqual(
      new Set(HOW_ORDER)
    )
  })

  it("says a record on a phone that isn't paired now, never up to date", () => {
    const view = laneView(
      WORDS.jobs,
      facts({
        paired: true,
        waiting: 1,
        run: { ...INITIAL_KEPT, last: { kind: "unpaired" } },
      })
    )
    expect(view).toMatchObject({ how: "unpaired", word: "Not paired" })
    expect(view.line).toBe(
      "This phone isn't paired with home now. Pair it in Settings. 1 event waits on this phone and goes next time."
    )
  })
})
