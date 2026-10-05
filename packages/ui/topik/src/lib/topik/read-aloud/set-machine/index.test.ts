import type { PaceBook } from "@topik/lib/topik/read-aloud/records"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
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
