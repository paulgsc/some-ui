// Runs conjugation itself: nothing here is mocked.
import type { Reading } from "@topik/lib/topik/conjugation"
import { checkPhrase, type Phrase } from "@topik/lib/topik/phrases"
import { checkProposal } from "@topik/lib/topik/phrases/proposal"
import { PHRASE_IDS, PHRASES } from "@topik/lib/topik/phrases/shelf"
import { describe, expect, it } from "vitest"

/**
 * Every identifier that has landed, in order. An identifier is identity
 * (canon Def. 1.3): this list only grows, and a new entry is added to its end
 * here and in `PHRASE_IDS` together.
 */
const LANDED: ReadonlyArray<(typeof PHRASE_IDS)[number]> = [
  "ph.where-is-my-phone",
  "ph.rained-so-stayed-home",
  "ph.shall-we-eat-together",
  "ph.this-is-really-good",
  "ph.please-sit-here",
  "ph.cold-so-shall-we-go-in",
  "ph.i-dont-really-know",
  "ph.its-okay",
  "ph.bit-busy-today",
  "ph.did-you-eat",
  "ph.pricey-but-good",
  "ph.going-to-eat",
  "ph.will-it-rain-tomorrow",
  "ph.i-didnt-know",
]

const entries = PHRASE_IDS.map((id) => [id, PHRASES[id]] as const)

/** A phrase to break one way at a time: 비가 와서 집에 있었어요. */
const base: Phrase = PHRASES["ph.rained-so-stayed-home"]

const withParts = (
  parts: Phrase["parts"],
  over: Partial<Phrase> = {}
): Phrase => ({
  ...base,
  ...over,
  parts,
})

describe("the phrase shelf", () => {
  it("keeps every identifier that has landed, in place", () => {
    expect(PHRASE_IDS.slice(0, LANDED.length)).toEqual(LANDED)
    expect(new Set(PHRASE_IDS).size).toBe(PHRASE_IDS.length)
    expect(Object.keys(PHRASES).sort()).toEqual([...PHRASE_IDS].sort())
  })

  it.each(entries)(
    "keeps %s: its parts rebuild it and keep every rule",
    (_, phrase) => {
      expect(checkPhrase(phrase)).toEqual([])
    }
  )

  // The seed (C1341): written by a session, with no native audio kept.
  // Later entries may be accepted, or heard natively, and are not held here.
  it("holds every seed entry as proposed until the owner accepts it", () => {
    for (const id of LANDED) expect(PHRASES[id].status, id).toBe("proposed")
  })

  it("labels every seed entry's audio honestly: the AI voice", () => {
    for (const id of LANDED) expect(PHRASES[id].hear, id).toBe("ai-voice")
  })

  it("gives each entry distinct English wordings", () => {
    for (const [id, { intents }] of entries) {
      expect(new Set(intents).size, id).toBe(intents.length)
      for (const intent of intents) expect(intent.trim(), id).toBe(intent)
    }
  })
})

describe("the phrase check", () => {
  const [rain, come, home, stay] = PHRASES["ph.rained-so-stayed-home"].parts

  it("refuses parts that don't write the Korean, run for run", () => {
    expect(checkPhrase({ ...base, korean: "비가 와서 집에 있어요." })).toEqual([
      {
        kind: "rebuild",
        written: ["비가", "와서", "집에", "있어요"],
        built: ["비가", "와서", "집에", "있었어요"],
      },
    ])
  })

  it("refuses a built part that breaks its ending: 왔어서", () => {
    const past = {
      kind: "built",
      reading: { dictionary: "오다", ending: "conn.aseo.cause", tense: "past" },
      gloss: "come",
    } as const
    expect(
      checkPhrase(
        withParts([rain, past, home, stay], {
          korean: "비가 왔어서 집에 있었어요.",
        })
      )
    ).toEqual([
      {
        kind: "breach",
        part: 1,
        breach: { rule: "tense", ending: "conn.aseo.cause", tense: "past" },
      },
    ])
  })

  it("refuses a phrase no closing ending ends", () => {
    expect(
      checkPhrase(withParts([rain, come], { korean: "비가 와서." }))
    ).toEqual([{ kind: "unclosed" }])
  })

  it("refuses a closing ending before the last part", () => {
    const comes = {
      kind: "built",
      reading: { dictionary: "오다", ending: "close.ayo.plain", tense: "none" },
      gloss: "come",
    } as const
    expect(
      checkPhrase(
        withParts([rain, comes, home, stay], {
          korean: "비가 와요 집에 있었어요.",
        })
      )
    ).toEqual([{ kind: "closed-early", part: 1 }])
  })

  it("refuses a register its closing ending doesn't have", () => {
    expect(checkPhrase({ ...base, register: "반말" })).toEqual([
      { kind: "register", closes: "해요" },
    ])
  })

  it("refuses a mood its closing ending can't end in", () => {
    const good = PHRASES["ph.this-is-really-good"]
    expect(
      checkPhrase({ ...good, korean: "이거 정말 맛있네요?", mood: "question" })
    ).toEqual([{ kind: "mood", ends: ["statement"] }])
  })

  it("refuses a command after -아서/어서", () => {
    const sit = {
      kind: "built",
      reading: {
        dictionary: "앉다",
        ending: "close.seyo.asking",
        tense: "none",
      },
      gloss: "sit",
    } as const
    expect(
      checkPhrase(
        withParts([rain, come, sit], {
          korean: "비가 와서 앉으세요.",
          mood: "command",
        })
      )
    ).toEqual([{ kind: "refused-mood", part: 1 }])
  })

  it("refuses -(으)러 not followed by going or coming", () => {
    const going = PHRASES["ph.going-to-eat"]
    const eats = {
      kind: "built",
      reading: { dictionary: "먹다", ending: "close.ayo.plain", tense: "none" },
      gloss: "eat",
    } as const
    expect(
      checkPhrase({
        ...going,
        korean: "밥 먹으러 먹어요.",
        parts: [going.parts[0], going.parts[1], eats],
      })
    ).toEqual([{ kind: "then-movement", part: 1 }])
  })

  it("refuses -는 바람에 not followed by the past", () => {
    const missed = {
      kind: "built",
      reading: {
        dictionary: "놓치다",
        ending: "conn.neun-barame.cause",
        tense: "none",
      },
      gloss: "miss",
    } as const
    const late = {
      kind: "built",
      reading: { dictionary: "오다", ending: "close.ayo.plain", tense: "none" },
      gloss: "come",
    } as const
    expect(
      checkPhrase(withParts([missed, late], { korean: "놓치는 바람에 와요." }))
    ).toEqual([{ kind: "then-past", part: 0 }])
  })
})

const built = (
  dictionary: Reading["dictionary"],
  ending: Reading["ending"],
  tense: Reading["tense"] = "none"
) =>
  ({
    kind: "built",
    reading: { dictionary, ending, tense },
    gloss: "-",
  }) as const

const word = (written: string) =>
  ({ kind: "word", written, lemma: written, gloss: "-" }) as const

describe("the phrase check, over whole sentences", () => {
  it("keeps an ending written as two words: 사는 동안", () => {
    expect(
      checkPhrase(
        withParts(
          [
            word("서울에"),
            built("살다", "conn.neun-dongan.time"),
            word("많이"),
            built("배우다", "close.ayo.plain", "past"),
          ],
          { korean: "서울에 사는 동안 많이 배웠어요." }
        )
      )
    ).toEqual([])
  })

  it("holds -는 바람에 to the predicate that ends the sentence, past or not", () => {
    const parts = [
      word("버스를"),
      built("놓치다", "conn.neun-barame.cause"),
      built("걷다", "conn.aseo.cause"),
    ] as const
    expect(
      checkPhrase(
        withParts([...parts, built("오다", "close.ayo.plain", "past")], {
          korean: "버스를 놓치는 바람에 걸어서 왔어요.",
        })
      )
    ).toEqual([])
    expect(
      checkPhrase(
        withParts([...parts, built("오다", "close.ayo.plain")], {
          korean: "버스를 놓치는 바람에 걸어서 와요.",
        })
      )
    ).toEqual([{ kind: "then-past", part: 1 }])
  })

  it("holds -(으)러 to the predicate that ends the sentence: 사러 걸어서 가요", () => {
    expect(
      checkPhrase(
        withParts(
          [
            word("빵"),
            built("사다", "conn.reo.purpose"),
            built("걷다", "conn.aseo.cause"),
            built("가다", "close.ayo.plain"),
          ],
          {
            korean: "빵 사러 걸어서 가요.",
          }
        )
      )
    ).toEqual([])
  })

  it("holds -(으)러 to any predicate after it: 사러 나가서 기다렸어요", () => {
    expect(
      checkPhrase(
        withParts(
          [
            word("빵"),
            built("사다", "conn.reo.purpose"),
            built("나가다", "conn.aseo.cause"),
            word("친구를"),
            built("기다리다", "close.ayo.plain", "past"),
          ],
          { korean: "빵 사러 나가서 친구를 기다렸어요." }
        )
      )
    ).toEqual([])
  })

  it("keeps 갈 때 too", () => {
    expect(
      checkPhrase(
        withParts(
          [
            word("집에"),
            built("가다", "conn.l-ttae.time"),
            built("오다", "close.ayo.plain"),
          ],
          { korean: "집에 갈 때 와요." }
        )
      )
    ).toEqual([])
  })

  it("refuses a word written with anything but Hangul", () => {
    expect(
      checkPhrase(
        withParts([word("KTX"), built("가다", "close.ayo.plain")], {
          korean: "KTX 가요?",
          mood: "question",
        })
      )
    ).toEqual([
      { kind: "korean-not-hangul" },
      { kind: "word-not-hangul", part: 0 },
    ])
    expect(
      checkPhrase(
        withParts([word(""), built("가다", "close.ayo.plain")], {
          korean: "가요.",
        })
      )
    ).toEqual([{ kind: "word-not-hangul", part: 0 }])
  })

  it("refuses Korean that holds anything but Hangul words and one end mark", () => {
    const go = [built("가다", "close.ayo.plain")]
    for (const korean of ["KTX 가요?", "3 시에 가요.", "가요", "가요?!"])
      expect(
        checkPhrase(withParts(go, { korean, mood: "question" })),
        korean
      ).toContainEqual({ kind: "korean-not-hangul" })
  })

  it("refuses an end mark that doesn't say whether the sentence asks", () => {
    expect(
      checkPhrase({ ...PHRASES["ph.its-okay"], korean: "괜찮아요?" })
    ).toEqual([{ kind: "mark", asks: false }])
    expect(
      checkPhrase({ ...PHRASES["ph.did-you-eat"], korean: "밥 먹었어." })
    ).toEqual([{ kind: "mark", asks: true }])
    expect(
      checkPhrase({
        ...PHRASES["ph.shall-we-eat-together"],
        korean: "같이 먹을까요.",
      })
    ).toEqual([{ kind: "mark", asks: true }])
  })

  it("refuses a word after the predicate that ends the sentence", () => {
    expect(
      checkPhrase(
        withParts(
          [word("뭐"), built("먹다", "close.ayo.plain"), word("우리")],
          { korean: "뭐 먹어요 우리?", mood: "question" }
        )
      )
    ).toEqual([{ kind: "closed-early", part: 1 }, { kind: "unclosed" }])
  })

  it("refuses a built part whose stem its ending doesn't take: 크느라고", () => {
    expect(
      checkPhrase(
        withParts(
          [
            built("크다", "conn.neurago.cause"),
            built("오다", "close.ayo.plain", "past"),
          ],
          { korean: "크느라고 왔어요." }
        )
      )
    ).toEqual([
      {
        kind: "breach",
        part: 0,
        breach: { rule: "stem", ending: "conn.neurago.cause" },
      },
    ])
  })

  it("asks only for an action, in no tense", () => {
    expect(
      checkPhrase(
        withParts([built("바쁘다", "close.seyo.asking")], {
          korean: "바쁘세요.",
          mood: "command",
        })
      )
    ).toEqual([{ kind: "mood-stem" }])
    expect(
      checkPhrase(
        withParts([built("춥다", "close.lkkayo.proposing")], {
          korean: "추울까요?",
          mood: "suggestion",
        })
      )
    ).toEqual([{ kind: "mood-stem" }])
    expect(
      checkPhrase(
        withParts([built("먹다", "close.ayo.plain", "past")], {
          korean: "먹었어요.",
          mood: "command",
        })
      )
    ).toEqual([{ kind: "mood-tense" }])
    expect(
      checkPhrase(
        withParts([built("가다", "close.a.plain", "past")], {
          korean: "갔어.",
          mood: "suggestion",
          register: "반말",
        })
      )
    ).toEqual([{ kind: "mood-tense" }])
  })
})

describe("a proposed phrase (KP5)", () => {
  const proposal = {
    id: "ph.i-missed-the-bus",
    korean: "버스를 놓쳤어요.",
    intents: ["I missed the bus"],
    register: "해요",
    toWhom: "anyone",
    setting: "everyday · running late",
    mood: "statement",
    parts: [
      { kind: "word", written: "버스를", lemma: "버스", gloss: "bus" },
      {
        kind: "built",
        reading: {
          dictionary: "놓치다",
          ending: "close.ayo.plain",
          tense: "past",
        },
        gloss: "miss",
      },
    ],
  }

  it("is put forward when it holds, proposed and in the AI voice", () => {
    expect(checkProposal(proposal)).toMatchObject({
      ok: true,
      id: "ph.i-missed-the-bus",
      phrase: { status: "proposed", hear: "ai-voice" },
      faults: [],
    })
  })

  it("is refused with a word that isn't on the vocabulary list", () => {
    const unlisted = {
      ...proposal,
      parts: [
        proposal.parts[0],
        {
          kind: "built",
          reading: {
            dictionary: "타다",
            ending: "close.ayo.plain",
            tense: "past",
          },
          gloss: "ride",
        },
      ],
    }
    const checked = checkProposal(unlisted)
    expect(checked.ok).toBe(false)
    if (!checked.ok) expect(checked.error).toContain("vocabulary list")
  })

  it("is refused with an ending that isn't in the catalogue", () => {
    const unknown = {
      ...proposal,
      parts: [
        proposal.parts[0],
        {
          kind: "built",
          reading: {
            dictionary: "놓치다",
            ending: "close.da.plain",
            tense: "past",
          },
          gloss: "miss",
        },
      ],
    }
    const checked = checkProposal(unknown)
    expect(checked.ok).toBe(false)
    if (!checked.ok) expect(checked.error).toContain("parts[1].reading.ending")
  })

  it.each(["괜찮아요.", "괜찮아요!"])(
    "is refused as %s, a sentence the shelf already holds, naming its entry",
    (korean) => {
      const checked = checkProposal({
        ...proposal,
        id: "ph.its-fine",
        korean,
        intents: ["it's fine"],
        toWhom: "anyone",
        setting: "everyday",
        mood: "statement",
        parts: [
          {
            kind: "built",
            reading: {
              dictionary: "괜찮다",
              ending: "close.ayo.plain",
              tense: "none",
            },
            gloss: "be okay",
          },
        ],
      })
      expect(checked.ok && checked.faults).toEqual([
        { kind: "korean-taken", id: "ph.its-okay" },
      ])
    }
  )

  it("is put forward asking what the shelf only says: 괜찮아요?", () => {
    const checked = checkProposal({
      ...proposal,
      id: "ph.are-you-okay",
      korean: "괜찮아요?",
      intents: ["are you okay"],
      mood: "question",
      parts: [
        {
          kind: "built",
          reading: {
            dictionary: "괜찮다",
            ending: "close.ayo.plain",
            tense: "none",
          },
          gloss: "be okay",
        },
      ],
    })
    expect(checked.ok && checked.faults).toEqual([])
  })

  it("is refused when it claims what only the owner gives: acceptance, audio", () => {
    for (const claim of [
      { status: { accepted: "2026-11-01" } },
      { hear: "native-scene" },
    ]) {
      const checked = checkProposal({ ...proposal, ...claim })
      expect(checked.ok).toBe(false)
      if (!checked.ok) expect(checked.error).toContain("Unrecognized key")
    }
  })

  it("is refused with a lemma that isn't Hangul", () => {
    const checked = checkProposal({
      ...proposal,
      parts: [{ ...proposal.parts[0], lemma: "bus!" }, proposal.parts[1]],
    })
    expect(checked.ok).toBe(false)
    if (!checked.ok) expect(checked.error).toContain("Hangul")
  })

  it("is refused under an id the shelf already holds", () => {
    expect(checkProposal({ ...proposal, id: "ph.its-okay" })).toMatchObject({
      ok: true,
      faults: [{ kind: "id-taken" }],
    })
  })

  it("is refused when its parts don't rebuild it, with the reason", () => {
    expect(
      checkProposal({ ...proposal, korean: "버스를 놓처요." })
    ).toMatchObject({
      ok: true,
      faults: [{ kind: "rebuild" }],
    })
  })
})
