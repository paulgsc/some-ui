import { fnv1a, unitIntervalBySeed } from "@some-ui/core-utils"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import type { PaceBook } from "@topik/lib/topik/read-aloud/records"
import { LEVEL_ONE_SET } from "@topik/lib/topik/read-aloud/repo-sets"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import { buildSet } from "@topik/lib/topik/read-aloud/set-builder"
import type {
  EntryRole,
  SetEffect,
  SetEvent,
  SetMachineState,
} from "@topik/lib/topik/read-aloud/set-machine"
import {
  createSetMachine,
  currentEntry,
  freshSet,
  MAX_RETURNS,
  progressOf,
  setMachineReducer,
} from "@topik/lib/topik/read-aloud/set-machine"
import type { Tally } from "@topik/lib/topik/read-aloud/tally"
import { noteRead, noteShown } from "@topik/lib/topik/read-aloud/tally"
import {
  audioWaitMs,
  MAX_SCREEN_MS,
  nominalRepMs,
  sentenceTurnMs,
  SITTING_MS,
  speechFallbackMs,
  wordTurnMs,
} from "@topik/lib/topik/read-aloud/timing"
import { describe, expect, it } from "vitest"

const word = (wordId: string, text: string): SetItem => ({
  kind: "word",
  key: `w:${wordId}:${text}`,
  wordId,
  text,
  lineId: "line",
  syllables: text.length,
})

const sentence = (lineId: string, text: string): SetItem => ({
  kind: "sentence",
  key: `s:${lineId}`,
  lineId,
  text,
  syllables: text.replace(/[^가-힣]/g, "").length,
  wordIds: [],
})

const JUSEYO = word("juda", "주세요")
const KEOPI = word("keopi", "커피")
const ONE_CUP = sentence("one-cup", "한 잔 주세요.")
const SET: Array<SetItem> = [JUSEYO, ONE_CUP, KEOPI]

/** Every word already seen, so a report schedules a plain return. */
const SEEN: PaceBook = {
  juda: { factor: 1, seen: 3 },
  keopi: { factor: 1, seen: 3 },
}

/** A host that plays the effects back: it owns the clock and the speech. */
class Host {
  state: SetMachineState = createSetMachine(1)
  now = 0
  effects: Array<SetEffect> = []
  private wait: { seq: number; ms: number } | null = null
  private speech: { seq: number } | null = null

  send(event: SetEvent): void {
    const { state, effects } = setMachineReducer(this.state, event)
    this.state = state
    this.effects.push(...effects)
    for (const effect of effects) {
      if (effect.type === "wait") this.wait = effect
      if (effect.type === "speak") this.speech = effect
    }
  }

  begin(items: Array<SetItem>, paces: PaceBook = SEEN): void {
    this.send({
      type: "begin-set",
      at: this.now,
      level: 1,
      progress: freshSet(items),
      paces,
    })
  }

  /** Let the current step end on its own: speech first, else its wait. */
  step(heardMs = 1000): void {
    if (this.speech?.seq === this.state.seq) {
      this.now += heardMs
      this.send({ type: "spoken", at: this.now, seq: this.speech.seq, heardMs })
      return
    }
    const wait = this.wait
    if (wait?.seq !== this.state.seq) throw new Error("nothing is running")
    this.now += wait.ms
    this.send({ type: "elapsed", at: this.now, seq: wait.seq })
  }

  /** Step until the phase leaves the entry at `cursor`. */
  finishEntry(): void {
    const cursor = this.state.cursor
    while (this.state.cursor === cursor && this.onEntry()) this.step()
  }

  onEntry(): boolean {
    return !["idle", "summary", "paused", "sitting-over"].includes(
      this.state.phase.name
    )
  }

  run(): void {
    while (this.onEntry()) this.step()
  }

  of<T extends SetEffect["type"]>(
    type: T
  ): Array<Extract<SetEffect, { type: T }>> {
    return this.effects.filter(
      (effect): effect is Extract<SetEffect, { type: T }> =>
        effect.type === type
    )
  }

  roles(): Array<EntryRole> {
    return this.state.queue.map((entry) => entry.role)
  }
}

describe("a rep's ladder (Def. 4.8)", () => {
  it("runs glyphs, turn, audio, echo, gloss, then the next item", () => {
    const host = new Host()
    host.begin(SET)
    const phases: Array<string> = []
    while (host.state.cursor === 0) {
      phases.push(host.state.phase.name)
      host.step()
    }
    expect(phases).toEqual(["glyphs", "turn", "audio", "echo", "gloss"])
    expect(host.state.phase.name).toBe("glyphs")
    expect(currentEntry(host.state)?.item).toBe(ONE_CUP)
  })

  it("gives a word its paced turn and a sentence its level's turn", () => {
    const host = new Host()
    host.begin([JUSEYO, ONE_CUP], { juda: { factor: 1.6, seen: 2 } })
    host.step()
    expect(host.of("wait").at(-1)?.ms).toBe(wordTurnMs(3, 1.6))
    host.finishEntry()
    host.step()
    expect(host.of("wait").at(-1)?.ms).toBe(sentenceTurnMs(5, 1))
  })

  it("paces a word whose id names an Object.prototype property", () => {
    const host = new Host()
    host.begin([word("constructor", "커피")], {})
    host.step()
    expect(host.of("wait").at(-1)?.ms).toBe(wordTurnMs(2, 1))
  })

  it("ends the audio on its fallback when speech never reports", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    host.step()
    expect(host.state.phase.name).toBe("audio")
    const wait = host.of("wait").at(-1)
    host.send({ type: "elapsed", at: 10_000, seq: wait?.seq ?? -1 })
    expect(host.state.phase.name).toBe("echo")
    expect(host.effects.at(-2)).toEqual({ type: "stop-speech" })
  })

  it("allows the audio time to synthesise, renewed from playback", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    host.step()
    expect(host.state.phase.name).toBe("audio")
    expect(host.of("speak").at(-1)?.playingMs).toBe(speechFallbackMs(3))
    expect(host.of("wait").at(-1)?.ms).toBe(audioWaitMs(3))
  })

  it("ignores a stale timer", () => {
    const host = new Host()
    host.begin(SET)
    const stale = host.state.seq
    host.step()
    const before = host.state
    host.send({ type: "elapsed", at: 99, seq: stale })
    host.send({ type: "spoken", at: 99, seq: stale, heardMs: 1 })
    expect(host.state).toBe(before)
  })
})

describe("what a set counts (Prop. 6.4)", () => {
  it("counts each rep that ran to the end, at its nominal credit, and the set", () => {
    const host = new Host()
    host.begin(SET)
    host.run()
    expect(host.of("count-rep").map((effect) => effect.creditMs)).toEqual(
      SET.map((item) => nominalRepMs(item.kind, item.syllables, 1))
    )
    expect(host.of("count-set")).toHaveLength(1)
    expect(host.state.phase.name).toBe("summary")
    expect(host.state.counted).toBe(3)
  })

  it("credits the same however long the speech and the pause ran (iv)", () => {
    const slow = new Host()
    slow.begin([JUSEYO], { juda: { factor: 2, seen: 9 } })
    while (slow.onEntry()) slow.step(9000)
    const fast = new Host()
    fast.begin([JUSEYO], { juda: { factor: 0.5, seen: 9 } })
    while (fast.onEntry()) fast.step(200)
    expect(slow.of("count-rep")).toEqual(fast.of("count-rep"))
  })

  it("counts nothing for a skipped rep, and leaves its pace alone (i)", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    host.send({ type: "skip", at: host.now })
    expect(host.state.cursor).toBe(1)
    host.run()
    expect(host.of("count-rep")).toHaveLength(2)
    expect(host.of("save-pace").map((effect) => effect.wordId)).toEqual([
      "keopi",
    ])
  })

  it("restarts a rep the page hid, and counts it once (i)", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    host.step()
    host.send({ type: "hidden", at: host.now })
    expect(host.state.phase).toMatchObject({ name: "paused", by: "hidden" })
    host.send({ type: "resume", at: host.now })
    expect(host.state.phase.name).toBe("paused")
    host.send({ type: "shown", at: host.now })
    expect(host.state.phase.name).toBe("glyphs")
    expect(host.state.cursor).toBe(0)
    host.run()
    expect(host.of("count-rep")).toHaveLength(3)
  })

  it("restarts a paused rep, and a pause left two minutes ends the sitting", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    host.send({ type: "pause", at: host.now })
    expect(host.of("wait").at(-1)?.ms).toBe(MAX_SCREEN_MS)
    host.send({ type: "resume", at: host.now })
    expect(host.state.phase.name).toBe("glyphs")
    host.send({ type: "pause", at: host.now })
    host.step()
    expect(host.state.phase.name).toBe("sitting-over")
    expect(progressOf(host.state)?.queue).toHaveLength(3)
  })

  it("holds a rep for the session, off screen or on, and two minutes on screen end the sitting", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    host.send({ type: "held", at: host.now })
    expect(host.state.phase).toMatchObject({ name: "paused", by: "session" })
    expect(host.of("wait").at(-1)?.ms).toBe(MAX_SCREEN_MS)
    // Only the session lets it go: not the learner's Resume.
    host.send({ type: "resume", at: host.now })
    expect(host.state.phase.name).toBe("paused")
    // Hidden, it shows nothing and waits; shown, still held, it is on screen.
    host.send({ type: "hidden", at: host.now })
    expect(host.state.phase).toMatchObject({ by: "hidden" })
    expect(() => host.step()).toThrow("nothing is running")
    host.send({ type: "held", at: host.now })
    expect(host.state.phase).toMatchObject({ by: "session" })
    host.send({ type: "shown", at: host.now })
    expect(host.state.phase.name).toBe("glyphs")
    expect(host.state.cursor).toBe(0)

    host.send({ type: "held", at: host.now })
    host.step()
    expect(host.state.phase.name).toBe("sitting-over")
    expect(progressOf(host.state)?.queue).toHaveLength(3)
  })

  it("leaves a learner's pause to the learner when the session holds too", () => {
    const host = new Host()
    host.begin(SET)
    host.send({ type: "pause", at: host.now })
    host.send({ type: "held", at: host.now })
    host.send({ type: "shown", at: host.now })
    expect(host.state.phase).toMatchObject({ name: "paused", by: "learner" })
  })

  it("counts a reported rep like any other, and its returns for nothing (ii)", () => {
    const quiet = new Host()
    quiet.begin(SET)
    quiet.run()

    const reported = new Host()
    reported.begin(SET)
    reported.send({ type: "stuck", at: 0 })
    reported.run()

    expect(reported.roles()).toEqual(["rep", "rep", "rep", "return"])
    expect(reported.of("count-rep")).toEqual(quiet.of("count-rep"))
    expect(reported.of("count-set")).toEqual(quiet.of("count-set"))
    expect(reported.state.counted).toBe(quiet.state.counted)
  })
})

describe("a stuck report", () => {
  it("ends the turn and plays the audio", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    expect(host.state.phase.name).toBe("turn")
    host.send({ type: "stuck", at: host.now })
    expect(host.state.phase.name).toBe("audio")
    // The learner asked to hear it: it cuts in.
    expect(host.of("speak").at(-1)).toEqual(
      expect.objectContaining({ text: JUSEYO.text, urgency: "now" })
    )
  })

  it("leaves audio the set's own clock reaches to wait its turn", () => {
    const host = new Host()
    host.begin(SET)
    while (host.state.phase.name !== "audio") host.step()
    expect(host.of("speak")).toEqual([
      expect.objectContaining({ text: JUSEYO.text, urgency: "next" }),
    ])
  })

  it("lengthens the word's pace, and a clean return shortens it", () => {
    const host = new Host()
    host.begin(SET)
    host.send({ type: "stuck", at: 0 })
    host.run()
    const paces = host.of("save-pace").filter((each) => each.wordId === "juda")
    expect(paces.map((each) => each.pace.factor)).toEqual([1.4, 1.4 * 0.88])
    expect(paces.map((each) => each.pace.seen)).toEqual([4, 5])
  })

  it("leaves a sentence's pace alone: it has none (Cor. 4.6 (ii))", () => {
    const host = new Host()
    host.begin([ONE_CUP, JUSEYO])
    host.send({ type: "stuck", at: 0 })
    host.run()
    expect(host.of("save-pace").map((each) => each.wordId)).toEqual(["juda"])
    expect(host.roles()).toEqual(["rep", "rep", "return"])
  })

  it("brings an item back at most twice", () => {
    const host = new Host()
    host.begin(SET)
    while (host.onEntry()) {
      if (
        currentEntry(host.state)?.item === JUSEYO &&
        host.state.phase.name === "glyphs"
      ) {
        host.send({ type: "stuck", at: host.now })
      }
      host.step()
    }
    expect(host.roles().filter((role) => role === "return")).toHaveLength(
      MAX_RETURNS
    )
  })

  it("introduces a word reported on first sight, then returns it", () => {
    const host = new Host()
    host.begin([JUSEYO, ONE_CUP, KEOPI, ONE_CUP], {})
    host.send({ type: "stuck", at: 0 })
    host.finishEntry()
    expect(host.state.queue.map((entry) => entry.role)).toEqual([
      "rep",
      "rep",
      "introduction",
      "rep",
      "rep",
      "return",
    ])
    host.finishEntry()
    expect(host.state.phase.name).toBe("intro-audio")
    expect(host.of("speak").at(-1)?.text).toBe(JUSEYO.text)
    const before = host.effects.length
    host.finishEntry()
    const during = host.effects.slice(before)
    expect(during.some((effect) => effect.type === "count-rep")).toBe(false)
    expect(during.some((effect) => effect.type === "save-pace")).toBe(false)
    host.run()
    expect(host.of("count-rep")).toHaveLength(4)
  })

  it("still brings back an item reported stuck, then skipped", () => {
    const host = new Host()
    host.begin(SET)
    host.send({ type: "stuck", at: 0 })
    host.send({ type: "skip", at: 0 })
    expect(host.roles()).toEqual(["rep", "rep", "rep", "return"])
    host.run()
    expect(host.of("count-rep")).toHaveLength(2)
    expect(host.of("save-pace").map((each) => each.pace)).toEqual([
      { factor: 0.88, seen: 4 },
      { factor: 0.88, seen: 4 },
    ])
  })

  it("introduces a first-sight word reported stuck, then skipped", () => {
    const host = new Host()
    host.begin([JUSEYO, ONE_CUP, KEOPI, ONE_CUP], {})
    host.send({ type: "stuck", at: 0 })
    host.send({ type: "skip", at: 0 })
    expect(host.roles()).toEqual([
      "rep",
      "rep",
      "introduction",
      "rep",
      "rep",
      "return",
    ])
  })

  it("keeps a report through a pause and a hidden page", () => {
    for (const interruption of [
      ["pause", "resume"],
      ["hidden", "shown"],
    ] as const) {
      const host = new Host()
      host.begin(SET)
      host.send({ type: "stuck", at: 0 })
      host.send({ type: interruption[0], at: host.now })
      host.send({ type: interruption[1], at: host.now })
      expect(host.state.phase.name).toBe("glyphs")
      expect(host.state.reported).toBe(true)
      host.finishEntry()
      expect(host.roles()).toEqual(["rep", "rep", "rep", "return"])
      expect(host.of("save-pace").at(-1)?.pace.factor).toBe(1.4)
    }
  })

  it("keeps a report through the end of a sitting", () => {
    const host = new Host()
    host.begin(SET)
    host.send({ type: "stuck", at: 0 })
    host.now += SITTING_MS
    host.send({ type: "pause", at: host.now })
    const progress = progressOf(host.state)
    expect(progress?.reported).toBe(true)
    const next = new Host()
    if (progress) {
      next.send({ type: "begin-set", at: 0, level: 1, progress, paces: SEEN })
    }
    next.finishEntry()
    expect(next.roles()).toEqual(["rep", "rep", "rep", "return"])
  })

  it("does not carry a report on to the next entry", () => {
    const host = new Host()
    host.begin(SET)
    host.send({ type: "stuck", at: 0 })
    host.finishEntry()
    expect(host.state.reported).toBe(false)
  })

  it("places a return before its gap when only that avoids three alike", () => {
    const host = new Host()
    host.begin([JUSEYO, ONE_CUP, KEOPI, word("jan", "잔")])
    host.send({ type: "stuck", at: 0 })
    host.finishEntry()
    expect(host.state.queue.map((entry) => entry.item.kind)).toEqual([
      "word",
      "word",
      "sentence",
      "word",
      "word",
    ])
    expect(host.roles()).toEqual(["rep", "return", "rep", "rep", "rep"])
  })

  it("places a return where it makes no three alike, when it can", () => {
    const host = new Host()
    host.begin([JUSEYO, ONE_CUP, KEOPI, word("jan", "잔"), ONE_CUP])
    host.send({ type: "stuck", at: 0 })
    host.finishEntry()
    const kinds = host.state.queue.map((entry) => entry.item.kind)
    expect(kinds).toEqual([
      "word",
      "sentence",
      "word",
      "word",
      "sentence",
      "word",
    ])
  })
})

describe("the sitting bound (Rem. 4.10)", () => {
  it("lets the showing rep finish, then begins nothing new", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    host.now += SITTING_MS
    host.finishEntry()
    expect(host.of("count-rep")).toHaveLength(1)
    expect(host.state.phase.name).toBe("sitting-over")
    expect(progressOf(host.state)?.queue.map((entry) => entry.item)).toEqual([
      ONE_CUP,
      KEOPI,
    ])
  })

  it("resumes the set at its next rep in the next sitting", () => {
    const host = new Host()
    host.begin(SET)
    host.now += SITTING_MS
    host.finishEntry()
    host.send({ type: "start-sitting", at: host.now })
    expect(host.state.phase.name).toBe("glyphs")
    expect(currentEntry(host.state)?.item).toBe(ONE_CUP)
    expect(host.state.sittingStartedAt).toBe(host.now)
  })

  it("counts a set that ends after the bound, but shows no summary", () => {
    const host = new Host()
    host.begin([JUSEYO])
    host.now += SITTING_MS
    host.run()
    expect(host.of("count-set")).toHaveLength(1)
    expect(host.state.phase.name).toBe("sitting-over")
    host.send({ type: "start-sitting", at: host.now })
    expect(host.effects.at(-1)).toEqual({ type: "request-set" })
  })

  it("asks for the next set after the summary, until the bound", () => {
    const host = new Host()
    host.begin([JUSEYO])
    host.run()
    host.step()
    expect(host.state.phase.name).toBe("idle")
    expect(host.effects.at(-1)).toEqual({ type: "request-set" })
    host.begin([KEOPI])
    host.run()
    host.now += SITTING_MS
    host.send({ type: "next-set", at: host.now })
    expect(host.state.phase.name).toBe("sitting-over")
  })

  it("ends the sitting at a pause after the bound, keeping the rep", () => {
    const host = new Host()
    host.begin(SET)
    host.step()
    host.now += SITTING_MS
    host.send({ type: "pause", at: host.now })
    expect(host.state.phase.name).toBe("sitting-over")
    expect(host.effects.at(-1)).toEqual({ type: "stop-speech" })
    expect(host.of("count-rep")).toHaveLength(0)
    expect(progressOf(host.state)?.queue).toHaveLength(3)
  })

  it("carries the set's count through a resume from storage", () => {
    const host = new Host()
    host.begin(SET)
    host.now += SITTING_MS
    host.finishEntry()
    const progress = progressOf(host.state)
    expect(progress?.counted).toBe(1)
    const next = new Host()
    if (progress) {
      next.send({ type: "begin-set", at: 0, level: 1, progress, paces: SEEN })
    }
    next.run()
    expect(next.state.counted).toBe(3)
  })

  it("begins nothing on returning to the page after the bound", () => {
    const host = new Host()
    host.begin(SET)
    host.send({ type: "hidden", at: host.now })
    host.send({ type: "shown", at: host.now + SITTING_MS })
    expect(host.state.phase.name).toBe("sitting-over")
    expect(progressOf(host.state)?.queue).toHaveLength(3)
  })
})

describe("the sitting's list (Rem. 4.9)", () => {
  const OTHER = sentence("other", "커피 주세요.")
  const UNSEEN: PaceBook = {}

  it("lists a sentence when its rep reaches its first step, and no word", () => {
    const host = new Host()
    host.begin([JUSEYO, ONE_CUP, KEOPI, OTHER])
    expect(host.state.shown).toEqual([])
    host.finishEntry()
    expect(host.state.shown).toEqual(["one-cup"])
    host.finishEntry()
    host.finishEntry()
    expect(host.state.shown).toEqual(["one-cup", "other"])
  })

  it("lists a skipped sentence, which reached its first step", () => {
    const host = new Host()
    host.begin([ONE_CUP])
    host.send({ type: "skip", at: host.now })
    expect(host.state.shown).toEqual(["one-cup"])
  })

  it("adds nothing for a return or an introduction (Prop. 6.4 (ii))", () => {
    const run = (report: boolean): SetMachineState => {
      const host = new Host()
      host.begin([ONE_CUP, JUSEYO, OTHER, KEOPI, word("jan", "잔")], UNSEEN)
      while (host.onEntry()) {
        if (
          report &&
          host.state.phase.name === "glyphs" &&
          !host.state.reported
        ) {
          host.send({ type: "stuck", at: host.now })
        }
        host.step()
      }
      return host.state
    }
    const reported = run(true)
    expect(reported.queue.some((entry) => entry.role === "return")).toBe(true)
    expect(reported.queue.some((entry) => entry.role === "introduction")).toBe(
      true
    )
    expect(reported.shown).toEqual(run(false).shown)
    expect(reported.shown).toEqual(["one-cup", "other"])
  })

  it("moves a sentence shown again to the end, as the most recent", () => {
    const host = new Host()
    host.begin([ONE_CUP, OTHER])
    host.run()
    host.step()
    host.begin([ONE_CUP])
    expect(host.state.shown).toEqual(["other", "one-cup"])
  })

  it("is cleared when a sitting starts, listing the rep it resumes", () => {
    const host = new Host()
    host.begin([ONE_CUP, KEOPI, OTHER])
    host.finishEntry()
    host.now += SITTING_MS
    host.finishEntry()
    expect(host.state.phase.name).toBe("sitting-over")
    expect(host.state.shown).toEqual(["one-cup"])
    host.send({ type: "start-sitting", at: host.now })
    expect(host.state.shown).toEqual(["other"])
  })
})

describe("sets drawn across a sitting (Rem. 4.9)", () => {
  // Ten lines, four a set: three sets show them all, so the run reaches the
  // pool being full and goes on past it.
  const DECK: ReadAloudDeck = {
    ...LEVEL_ONE_SET,
    lines: LEVEL_ONE_SET.lines.slice(0, 10),
  }
  const IDS = DECK.lines.map((line) => line.id)

  /**
   * Drive the real machine and the real draw through a generated run of
   * reports, skips, pauses, hidden pages, a clock jumping past the bound and
   * a new sitting. `drawn` sees each draw with the list it was handed;
   * `started` sees each sentence rep that begins, with the list before it.
   */
  function drive(
    seed: number,
    drawn: (shown: ReadonlyArray<string>, lineIds: Array<string>) => void,
    started: (lineId: string, shown: ReadonlyArray<string>) => void
  ): { sittings: number } {
    const roll = (step: number): number =>
      unitIntervalBySeed(fnv1a(`${seed}:${step}`))
    const host = new Host()
    let sets = 0
    let sittings = 1
    let begun = ""
    for (let step = 0; step < 3000; step += 1) {
      const { phase } = host.state
      // A new sitting starts with nothing shown, in the event that starts it.
      const before = phase.name === "sitting-over" ? [] : host.state.shown
      if (phase.name === "idle") {
        const items = buildSet(DECK, {
          level: 1,
          seedKey: `${seed}:${sets}`,
          shown: before,
        })
        drawn(
          before,
          items.flatMap((item) => (item.kind === "sentence" ? item.lineId : []))
        )
        sets += 1
        host.begin(items, {})
      } else if (phase.name === "sitting-over") {
        sittings += 1
        host.send({ type: "start-sitting", at: host.now })
      } else if (phase.name === "paused") {
        host.send({
          type: phase.by === "learner" ? "resume" : "shown",
          at: host.now,
        })
      } else if (phase.name === "summary") {
        host.send({ type: "next-set", at: host.now })
      } else {
        const r = roll(step)
        if (r < 0.14) host.send({ type: "stuck", at: host.now })
        else if (r < 0.22) host.send({ type: "skip", at: host.now })
        else if (r < 0.27) host.send({ type: "pause", at: host.now })
        else if (r < 0.32) host.send({ type: "hidden", at: host.now })
        else if (r < 0.34) host.now += SITTING_MS
        else host.step()
      }
      const entry = currentEntry(host.state)
      const key = `${sets}:${host.state.cursor}:${host.state.shown.length}`
      if (
        host.onEntry() &&
        entry?.role === "rep" &&
        entry.item.kind === "sentence" &&
        key !== begun
      ) {
        // Only the first step of an entry is a showing: a restart after a
        // pause finds the line already listed, at the same cursor.
        if (host.state.shown.at(-1) === entry.item.lineId) {
          started(entry.item.lineId, before)
        }
      }
      begun = key
    }
    return { sittings }
  }

  it("draws no sentence twice while one not yet shown remains, and then the one shown longest ago (stuck returns, skips, a hidden page, a pause and a new sitting included)", () => {
    let repeats = 0
    let full = 0
    let second = 0
    for (let seed = 1; seed <= 25; seed += 1) {
      const { sittings } = drive(
        seed,
        (shown, lineIds) => {
          const unseen = IDS.filter((id) => !shown.includes(id))
          const fresh = lineIds.filter((id) => unseen.includes(id))
          // Every unshown sentence a set has room for is in it...
          expect(fresh).toHaveLength(Math.min(4, unseen.length))
          // ...and a shown one is drawn only to fill what they could not,
          // the one shown longest ago first.
          repeats += lineIds.length - fresh.length
          expect(new Set(lineIds).size).toBe(lineIds.length)
          if (unseen.length === 0) {
            full += 1
            expect([...lineIds].sort()).toEqual([...shown.slice(0, 4)].sort())
          }
        },
        (lineId, shown) => {
          // A sentence shown again begins only once none is left unshown.
          if (shown.includes(lineId)) {
            expect(IDS.filter((id) => !shown.includes(id))).toEqual([])
          }
        }
      )
      if (sittings > 1) second += 1
    }
    expect(repeats).toBeGreaterThan(0)
    expect(full).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(0)
  })
})

describe("what the tally is told (Rem. 7.5)", () => {
  const AT = "2026-10-21T09:00:00.000Z"

  /** The tally a host keeps from the machine's effects, as the screen does. */
  const tallyOf = (host: Host): Tally =>
    host.effects.reduce<Tally>((tally, effect) => {
      if (effect.type === "note-shown")
        return noteShown(tally, effect.lineId, AT)
      if (effect.type === "count-rep" && effect.lineId !== undefined) {
        return noteRead(tally, effect.lineId)
      }
      return tally
    }, {})

  /** Every count, no date: the part of the tally a stuck report must not move. */
  const countsOf = (tally: Tally): Record<string, [number, number]> =>
    Object.fromEntries(
      Object.entries(tally).map(([id, row]) => [id, [row.shown, row.read]])
    )

  const shownLines = (host: Host): Array<string> =>
    host.of("note-shown").map((effect) => effect.lineId)

  it("shows the tally a sentence's rep once, and never a word, a return or an introduction (Prop. 6.4 (ii))", () => {
    const host = new Host()
    host.begin(SET, {})
    while (host.onEntry()) {
      const entry = currentEntry(host.state)
      if (host.state.phase.name === "glyphs" && entry?.role === "rep") {
        host.send({ type: "stuck", at: host.now })
      }
      host.step()
    }
    expect(host.roles()).toEqual(
      expect.arrayContaining(["rep", "return", "introduction"])
    )
    expect(shownLines(host)).toEqual(["one-cup"])
    expect(
      host.of("count-rep").flatMap((effect) => effect.lineId ?? [])
    ).toEqual(["one-cup"])
    expect(
      host.of("count-rep").filter((effect) => effect.lineId === undefined)
    ).toHaveLength(2)
  })

  it("shows it nothing again when a pause, a hidden page or a stored resume starts the rep over", () => {
    const host = new Host()
    host.begin([ONE_CUP, KEOPI])
    host.step()
    host.send({ type: "pause", at: host.now })
    host.send({ type: "resume", at: host.now })
    host.step()
    host.send({ type: "hidden", at: host.now })
    host.send({ type: "shown", at: host.now })
    expect(shownLines(host)).toEqual(["one-cup"])

    const progress = progressOf(host.state)
    expect(progress?.begun).toBe(true)
    const later = new Host()
    later.send({
      type: "begin-set",
      at: 0,
      level: 1,
      progress: JSON.parse(JSON.stringify(progress)),
      paces: SEEN,
    })
    later.run()
    expect(shownLines(later)).toEqual([])
    expect(countsOf(tallyOf(later))).toEqual({})
    expect(later.of("count-rep").map((effect) => effect.lineId)).toEqual([
      "one-cup",
      undefined,
    ])
  })

  it("resumes a set an older build stored, which counts its held rep as shown", () => {
    const host = new Host()
    host.send({
      type: "begin-set",
      at: 0,
      level: 1,
      progress: { ...freshSet([ONE_CUP]), begun: undefined },
      paces: SEEN,
    })
    expect(shownLines(host)).toEqual(["one-cup"])
  })

  it("names how a sentence began, and clears it with the entry", () => {
    const host = new Host()
    host.begin([ONE_CUP, KEOPI])
    expect(host.state.begun).toBe("fresh")
    host.send({ type: "pause", at: host.now })
    host.send({ type: "resume", at: host.now })
    expect(host.state.begun).toBe("fresh")
    host.finishEntry()
    expect(host.state.begun).toBeNull()

    const again = new Host()
    again.state = { ...again.state, shown: ["one-cup"] }
    again.begin([ONE_CUP, KEOPI])
    expect(again.state.begun).toBe("repeat")
    again.send({ type: "hidden", at: again.now })
    again.send({ type: "shown", at: again.now })
    expect(again.state.begun).toBe("repeat")
    expect(shownLines(again)).toEqual(["one-cup"])
  })

  it("holds a begun rep over into the next sitting as a first showing there, and shows the tally nothing", () => {
    const host = new Host()
    host.state = { ...host.state, shown: ["one-cup"] }
    host.begin([ONE_CUP, KEOPI])
    host.step()
    host.send({ type: "pause", at: host.now })
    host.step()
    expect(host.state.phase.name).toBe("sitting-over")
    expect(host.state.begun).toBe("repeat")
    host.send({ type: "start-sitting", at: host.now })
    expect(host.state.begun).toBe("fresh")
    expect(host.state.phase.name).toBe("glyphs")
    expect(shownLines(host)).toEqual(["one-cup"])
  })

  it("adds a skipped rep to shown and not to read to the end", () => {
    const host = new Host()
    host.begin([ONE_CUP, KEOPI])
    host.step()
    host.send({ type: "skip", at: host.now })
    host.run()
    expect(countsOf(tallyOf(host))).toEqual({ "one-cup": [1, 0] })
  })

  describe("for any run of a set, ends the same with or without stuck reports (Prop. 6.4 (ii), (iii))", () => {
    const DECK: ReadAloudDeck = {
      ...LEVEL_ONE_SET,
      lines: LEVEL_ONE_SET.lines.slice(0, 10),
    }

    /**
     * Run one drawn set. Skips and hidden pages follow the seed and the rep's
     * key, so a stuck report, which only adds returns and introductions,
     * leaves each of them where it was.
     */
    function run(seed: number, withStuck: boolean): Host {
      const roll = (key: string): number =>
        unitIntervalBySeed(fnv1a(`${seed}:${key}`))
      const items = buildSet(DECK, { level: 1, seedKey: `${seed}` })
      const host = new Host()
      host.begin(items, {})
      const handled = new Set<string>()
      while (host.onEntry()) {
        const entry = currentEntry(host.state)
        const key = entry && `${entry.role}:${entry.item.key}`
        if (
          entry?.role === "rep" &&
          key &&
          host.state.phase.name === "glyphs" &&
          !handled.has(key)
        ) {
          handled.add(key)
          if (withStuck && roll(`stuck:${key}`) < 0.6) {
            host.send({ type: "stuck", at: host.now })
          }
          if (roll(`skip:${key}`) < 0.25) {
            host.send({ type: "skip", at: host.now })
            continue
          }
          if (roll(`hide:${key}`) < 0.25) {
            host.send({ type: "hidden", at: host.now })
            host.send({ type: "shown", at: host.now })
            continue
          }
        }
        host.step()
      }
      return host
    }

    it("shows each sentence of the set once and reads to the end the ones not skipped", () => {
      let returns = 0
      let skipped = 0
      for (let seed = 1; seed <= 60; seed += 1) {
        const calm = run(seed, false)
        const reported = run(seed, true)
        returns += reported.roles().filter((role) => role === "return").length
        const lines = calm.state.queue.flatMap(({ item }) =>
          item.kind === "sentence" ? item.lineId : []
        )
        const counts = countsOf(tallyOf(calm))
        expect(Object.keys(counts).sort()).toEqual([...lines].sort())
        expect(countsOf(tallyOf(reported))).toEqual(counts)
        skipped += Object.values(counts).filter(([, read]) => read === 0).length
      }
      // The runs held returns to disregard, and reps to skip.
      expect(returns).toBeGreaterThan(0)
      expect(skipped).toBeGreaterThan(0)
    })
  })
})
