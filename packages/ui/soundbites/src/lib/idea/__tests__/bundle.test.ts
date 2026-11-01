/** @vitest-environment node */
import type { PatternTake, TakeEnded } from "@some-ui/voice-capture"
import type {
  BundleEffect,
  BundleEvent,
  BundleIntent,
  BundleState,
} from "@soundbites/lib/idea/bundle"
import {
  bundleIdea,
  cardView,
  initialBundle,
  stepBundle,
  swipeOf,
} from "@soundbites/lib/idea/bundle"
import type { IdeaDraft } from "@soundbites/lib/idea/draft"
import { IDEA_LISTS_SEED, newDraft } from "@soundbites/lib/idea/draft"
import type { Idea } from "@soundbites/lib/idea/model"
import { describe, expect, it } from "vitest"

const AT = "2026-11-01T09:00:00.000Z"
const LATER = "2026-11-01T09:05:00.000Z"

function run(
  events: ReadonlyArray<BundleEvent>,
  start: BundleState = initialBundle("next", AT)
): { state: BundleState; effects: Array<BundleEffect> } {
  let state = start
  const effects: Array<BundleEffect> = []
  for (const event of events) {
    const next = stepBundle(state, event)
    state = next.state
    effects.push(...next.effects)
  }
  return { state, effects }
}

const tap = (
  intent: Exclude<BundleIntent, { type: "another" }>
): BundleEvent => ({ ...intent, at: LATER })

const draft = (over: Partial<IdeaDraft> = {}): IdeaDraft => ({
  ...newDraft("idea-1", AT, IDEA_LISTS_SEED),
  ...over,
})

const opened = (
  kept: IdeaDraft | null | undefined,
  takes: ReadonlyArray<PatternTake> = [],
  ideas: ReadonlyArray<Idea> | null = []
): BundleEvent => ({
  type: "opened",
  draft: kept,
  kept: ideas,
  takes,
  lists: IDEA_LISTS_SEED,
  id: "fresh",
  at: AT,
})

const take = (
  id: string,
  question: string,
  over: Partial<PatternTake> = {}
): PatternTake => ({
  id,
  answers: `idea:idea-1:${question}`,
  durationMs: 4_000,
  recordedAt: `2026-11-01T09:0${id.length % 10}:00.000Z`,
  standing: "current",
  kept: { place: "phone" },
  waits: true,
  ...over,
})

const ended = (
  ending: TakeEnded["ending"],
  question = "what",
  seq = 1
): BundleEvent => ({
  type: "ended",
  ended: {
    seq,
    answers: `idea:idea-1:${question}`,
    ending,
    id: ending === "kept" ? "t9" : null,
    reason: ending === "blocked" ? "denied" : null,
    unheard: false,
  },
})

/** Opened on a titled draft, at its questions. */
function onQuestions(
  over: Partial<IdeaDraft> = {},
  takes: ReadonlyArray<PatternTake> = []
): BundleState {
  return run([
    { type: "entered", at: AT },
    opened(
      draft({
        ...over,
        about: { ...draft().about, title: "Two hearings", ...over.about },
      }),
      takes
    ),
  ]).state
}

describe("a new idea as one bundle (ST26)", () => {
  describe("opening", () => {
    it("starts a fresh idea at what it is, dated today, when none is kept", () => {
      const { state, effects } = run([
        { type: "entered", at: AT },
        opened(null),
      ])
      expect(effects).toEqual([{ type: "open" }])
      expect(state.screen).toBe("about")
      expect(state.draft).toMatchObject({
        id: "fresh",
        at: AT,
        about: { title: "", topic: "Studio", keywords: [], format: "short" },
      })
    })

    it("resumes a kept idea at its questions once it has a title", () => {
      expect(onQuestions().screen).toBe("questions")
      expect(
        run([{ type: "entered", at: AT }, opened(draft())]).state.screen
      ).toBe("about")
    })

    it("says what is kept can't be read, and keeps nothing, when the draft or the ideas can't be", () => {
      for (const event of [opened(undefined), opened(null, [], null)]) {
        const { state } = run([{ type: "entered", at: AT }, event])
        expect(state.screen).toBe("unreadable")
        const again = run([tap({ type: "readAgain" })], state)
        expect(again.effects).toEqual([{ type: "open" }])
      }
    })

    it("after a Send cut short: clears the draft, lets go only the takes the kept idea names, and deletes the rest", () => {
      const sent: Idea = {
        id: "idea-1",
        at: AT,
        questions: 1,
        answers: [
          { question: "what", versions: [], takes: [{ at: AT, take: "t1" }] },
        ],
        passed: [],
      }
      const { state, effects } = run([
        { type: "entered", at: AT },
        opened(
          draft({ about: { ...draft().about, title: "x" } }),
          [
            take("t1", "what"),
            // Replaced before Send, and never named by the idea.
            take("t22", "what", { standing: "earlier" }),
            // Already gone home: neither let go again nor deleted.
            take("t333", "spark", { waits: undefined }),
          ],
          [sent]
        ),
      ])
      expect(state.draft.id).toBe("fresh")
      expect(effects).toEqual([
        { type: "open" },
        { type: "drop", takes: ["t22"] },
        { type: "settle", takes: ["t1"] },
        { type: "keepDraft", draft: null },
      ])
    })

    it("lets nothing go, and rewrites nothing, when every take a kept idea names has gone", () => {
      const sent: Idea = {
        id: "idea-0",
        at: AT,
        questions: 1,
        answers: [
          { question: "what", versions: [], takes: [{ at: AT, take: "t1" }] },
        ],
        passed: [],
      }
      const { effects } = run([
        { type: "entered", at: AT },
        opened(
          null,
          [
            {
              ...take("t1", "what", { waits: undefined }),
              answers: "idea:idea-0:what",
            },
          ],
          [sent]
        ),
      ])
      expect(effects).toEqual([{ type: "open" }])
    })

    it("takes off the draft what a take kept since answers: typed words said instead, and a mark for later", () => {
      const { state, effects } = run([
        { type: "entered", at: AT },
        opened(
          draft({
            about: { ...draft().about, title: "x" },
            typed: { what: "typed first", takeaway: "still typed" },
            later: ["spark", "picture"],
          }),
          [take("t1", "what"), take("t22", "spark")]
        ),
      ])
      expect(state.draft.typed).toEqual({ takeaway: "still typed" })
      expect(state.draft.later).toEqual(["picture"])
      expect(effects).toEqual([
        { type: "open" },
        { type: "keepDraft", draft: state.draft },
      ])
    })

    it("keeps waiting a take whose idea nothing readable owns: its draft or idea may only have been unreadable", () => {
      const { effects } = run([
        { type: "entered", at: AT },
        opened(null, [{ ...take("t1", "what"), answers: "idea:lost:what" }]),
      ])
      expect(effects).toEqual([{ type: "open" }])
    })
  })

  describe("what it is", () => {
    const about = run([{ type: "entered", at: AT }, opened(null)]).state

    it("keeps each change to the draft as it is made", () => {
      const { state, effects } = run(
        [
          tap({ type: "format", format: "video" }),
          tap({ type: "title", text: "Two hearings, one word" }),
          tap({ type: "topic", topic: "Korean" }),
          tap({ type: "keyword", keyword: "voice" }),
          tap({ type: "keyword", keyword: "mistakes" }),
          tap({ type: "keyword", keyword: "voice" }),
        ],
        about
      )
      expect(state.draft.about).toEqual({
        title: "Two hearings, one word",
        topic: "Korean",
        keywords: ["mistakes"],
        format: "video",
      })
      expect(effects).toHaveLength(6)
      expect(effects.every((effect) => effect.type === "keepDraft")).toBe(true)
    })

    it("holds the title to 80 characters, and picks only from the lists", () => {
      const { state } = run(
        [
          tap({ type: "title", text: "x".repeat(120) }),
          tap({ type: "topic", topic: "Not a topic" }),
          tap({ type: "keyword", keyword: "not a keyword" }),
        ],
        about
      )
      expect(state.draft.about.title).toHaveLength(80)
      expect(state.draft.about.topic).toBe("Studio")
      expect(state.draft.about.keywords).toEqual([])
    })

    it("goes on to the questions", () => {
      expect(run([tap({ type: "start" })], about).state.screen).toBe(
        "questions"
      )
    })
  })

  describe("swiping between the questions", () => {
    it("moves a card at a time, and no further than the ends", () => {
      const at = onQuestions()
      const { state } = run(
        [
          tap({ type: "swipe", to: "prev" }),
          tap({ type: "swipe", to: "next" }),
          tap({ type: "swipe", to: "next" }),
          tap({ type: "swipe", to: "next" }),
          tap({ type: "swipe", to: "next" }),
        ],
        at
      )
      expect(state.index).toBe(3)
      expect(run([tap({ type: "go", index: 1 })], state).state.index).toBe(1)
    })

    it("holds still while a take is under way, and keeps it when the screen goes or the page hides", () => {
      const busy = run([{ type: "busy", busy: true }], onQuestions()).state
      for (const intent of [
        { type: "swipe", to: "next" },
        { type: "go", index: 2 },
        { type: "review" },
        { type: "back" },
      ] as const) {
        expect(run([tap(intent)], busy).state).toBe(busy)
      }
      expect(run([{ type: "left" }], busy).effects).toEqual([{ type: "leave" }])
      // The page hiding (the app sent to the background) finishes it too.
      expect(run([{ type: "hidden" }], busy).effects).toEqual([
        { type: "leave" },
      ])
    })

    it("tells a swipe from a tap by how far the finger went", () => {
      expect(swipeOf(-61)).toBe("next")
      expect(swipeOf(75)).toBe("prev")
      expect(swipeOf(-20)).toBeNull()
      expect(swipeOf(59)).toBeNull()
    })
  })

  describe("saying an answer", () => {
    it("starts a take only with the draft it answers, kept first", () => {
      const at = onQuestions({}, [take("t1", "what")])
      const { effects } = run([tap({ type: "tap", question: "what" })], at)
      expect(effects).toEqual([
        {
          type: "tap",
          answers: "idea:idea-1:what",
          supersedes: "t1",
          draft: at.draft,
        },
      ])
    })

    it("says it again: once the new take is kept, the one it replaced is deleted for good, and only once", () => {
      const at = onQuestions({}, [take("t1", "what")])
      const redone = run([tap({ type: "tap", question: "what" })], at).state
      const now = take("t22", "what", {
        recordedAt: "2026-11-01T09:03:00.000Z",
      })
      const replaced = [now, take("t1", "what", { standing: "earlier" })]
      const listed = run([{ type: "takes", takes: replaced }], redone)
      expect(listed.effects).toEqual([{ type: "drop", takes: ["t1"] }])
      expect(cardView(listed.state, "what", false)).toEqual({ kind: "take" })
      // Listed again before the desk has dropped it: not asked twice.
      expect(
        run([{ type: "takes", takes: replaced }], listed.state).effects
      ).toEqual([])
      // A take already gone home is never deleted here.
      expect(
        run(
          [
            {
              type: "takes",
              takes: [
                now,
                take("t4444", "what", {
                  standing: "earlier",
                  waits: undefined,
                }),
              ],
            },
          ],
          redone
        ).effects
      ).toEqual([])
    })

    it("stops the take under way on its tap, and nothing else", () => {
      const busy = run([{ type: "busy", busy: true }], onQuestions()).state
      expect(
        run([tap({ type: "tap", question: "what" })], busy).effects
      ).toEqual([
        { type: "tap", answers: "idea:idea-1:what", supersedes: null },
      ])
    })

    it("redoes one from the look-over at its own card", () => {
      const review = run([tap({ type: "review" })], onQuestions()).state
      const { state } = run([tap({ type: "tap", question: "spark" })], review)
      expect(state.screen).toBe("questions")
      expect(state.index).toBe(2)
    })
  })

  describe("when voice doesn't come through", () => {
    it("says so on a card with no answer, for a refusal, a failure or no room", () => {
      for (const ending of ["blocked", "failed", "full"] as const) {
        const { state } = run([ended(ending)], onQuestions())
        expect(cardView(state, "what", false)).toEqual({
          kind: "failed",
          full: ending === "full",
        })
      }
      // Too short is the pattern's to say, and the card stays as it was.
      expect(
        cardView(run([ended("short")], onQuestions()).state, "what", false)
      ).toEqual({ kind: "take" })
    })

    it("leaves a card that has its answer as it is", () => {
      const at = onQuestions({}, [take("t1", "what")])
      expect(run([ended("failed")], at).state.modes).toEqual({})
    })

    it("types only once voice failed, marked, then says it instead", () => {
      const at = onQuestions()
      // Typing is never offered first.
      expect(
        run([tap({ type: "typeInstead", question: "what" })], at).state.modes
      ).toEqual({})
      const typed = run(
        [
          ended("blocked"),
          tap({ type: "typeInstead", question: "what" }),
          tap({ type: "typed", question: "what", text: "y".repeat(1_200) }),
        ],
        at
      )
      expect(cardView(typed.state, "what", false)).toEqual({
        kind: "typing",
        text: "y".repeat(1_000),
      })
      const kept = run(
        [
          tap({ type: "typed", question: "what", text: "  Two hearings  " }),
          tap({ type: "keepTyped", question: "what" }),
        ],
        typed.state
      )
      expect(kept.state.draft.typed).toEqual({ what: "Two hearings" })
      expect(cardView(kept.state, "what", false)).toEqual({
        kind: "typed",
        words: "Two hearings",
      })
      // Say it instead: the take kept takes the typed words' place.
      const said = run(
        [
          tap({ type: "tap", question: "what" }),
          {
            type: "takes",
            takes: [take("t1", "what")],
          },
          ended("kept"),
        ],
        kept.state
      )
      expect(said.state.draft.typed).toEqual({})
      expect(said.effects.at(-1)).toEqual({
        type: "keepDraft",
        draft: said.state.draft,
      })
      expect(cardView(said.state, "what", false)).toEqual({ kind: "take" })
    })

    it("comes back later: marked, and on to the next card", () => {
      const { state } = run(
        [
          ended("failed", "takeaway"),
          tap({ type: "later", question: "takeaway" }),
        ],
        run([tap({ type: "go", index: 1 })], onQuestions()).state
      )
      expect(state.index).toBe(2)
      expect(state.draft.later).toEqual(["takeaway"])
      expect(cardView(state, "takeaway", false)).toEqual({ kind: "later" })
      // Said now, it is no longer left for later.
      expect(
        run([tap({ type: "tap", question: "takeaway" })], state).state.draft
          .later
      ).toEqual([])
    })
  })

  describe("deleting before Send", () => {
    it("asks first, then deletes every take the answer has for good", () => {
      const at = onQuestions({}, [
        take("t1", "what"),
        take("t22", "what", { standing: "earlier" }),
        take("t333", "spark"),
      ])
      const asked = run([tap({ type: "askDelete", question: "what" })], at)
      expect(asked.state.confirm).toEqual({ kind: "answer", question: "what" })
      expect(
        run([tap({ type: "keepIt" })], asked.state).state.confirm
      ).toBeNull()
      const { state, effects } = run([tap({ type: "confirmed" })], asked.state)
      expect(effects).toEqual([{ type: "deleteTakes", takes: ["t1", "t22"] }])
      expect(
        run([{ type: "deleted", deleted: true }], state).state.notice
      ).toBe("deleted")
      expect(
        run([{ type: "deleted", deleted: false }], state).state.notice
      ).toBe("notDeleted")
    })

    it("deletes typed words the same way, and asks nothing for an answer not given", () => {
      const at = onQuestions({ typed: { spark: "a word" } })
      expect(
        run([tap({ type: "askDelete", question: "takeaway" })], at).state
          .confirm
      ).toBeNull()
      const { state } = run(
        [
          tap({ type: "askDelete", question: "spark" }),
          tap({ type: "confirmed" }),
        ],
        at
      )
      expect(state.draft.typed).toEqual({})
      expect(state.notice).toBe("deleted")
    })

    it("deletes the whole idea, every take it has, once asked", () => {
      const at = onQuestions({}, [
        take("t1", "what", { standing: "earlier" }),
        take("t22", "what"),
        take("t333", "spark"),
        { ...take("x", "what"), answers: "idea:other:what" },
      ])
      const { state, effects } = run(
        [tap({ type: "askDeleteAll" }), tap({ type: "confirmed" })],
        at
      )
      expect(effects).toEqual([
        { type: "deleteAll", takes: ["t1", "t22", "t333"] },
      ])
      const gone = run(
        [{ type: "deletedAll", deleted: true, id: "idea-2", at: LATER }],
        state
      ).state
      expect(gone.screen).toBe("about")
      expect(gone.draft.id).toBe("idea-2")
      expect(gone.notice).toBe("deletedAll")
      const kept = run(
        [{ type: "deletedAll", deleted: false, id: "idea-2", at: LATER }],
        state
      ).state
      expect(kept.draft.id).toBe("idea-1")
      expect(kept.notice).toBe("notDeleted")
    })
  })

  describe("sending it all", () => {
    it("needs a title and the first answer, and nothing more", () => {
      const untitled = run(
        [tap({ type: "review" })],
        onQuestions({ about: { ...draft().about, title: "  " } }, [
          take("t1", "what"),
        ])
      ).state
      expect(run([tap({ type: "send" })], untitled).effects).toEqual([])
      const unsaid = run([tap({ type: "review" })], onQuestions()).state
      expect(run([tap({ type: "send" })], unsaid).effects).toEqual([])
      const typed = run(
        [tap({ type: "review" })],
        onQuestions({ typed: { what: "typed" } })
      ).state
      expect(run([tap({ type: "send" })], typed).effects).toHaveLength(1)
    })

    it("sends one idea, whole: what it is, each take, the typed words, and what waits passed over", () => {
      const takes = [
        take("t1", "what", {
          standing: "earlier",
          recordedAt: "2026-11-01T09:01:00.000Z",
        }),
        take("t2", "what", { recordedAt: "2026-11-01T09:02:00.000Z" }),
        take("t3", "picture", { standing: "set-aside" }),
      ]
      const review = run(
        [tap({ type: "review" })],
        onQuestions(
          {
            about: {
              title: "  Two hearings  ",
              topic: "Studio",
              keywords: ["voice"],
              format: "video",
            },
            typed: { spark: "the word" },
          },
          takes
        )
      ).state
      const { effects } = run([tap({ type: "send" })], review)
      const idea = bundleIdea(review, LATER)
      // Only the take each answer has now: the rest are never sent.
      expect(effects).toEqual([{ type: "send", idea, takes: ["t2"] }])
      expect(idea).toEqual({
        id: "idea-1",
        at: AT,
        questions: 1,
        about: {
          title: "Two hearings",
          topic: "Studio",
          keywords: ["voice"],
          format: "video",
        },
        answers: [
          {
            question: "what",
            versions: [],
            takes: [{ at: "2026-11-01T09:02:00.000Z", take: "t2" }],
          },
          {
            question: "spark",
            versions: [{ at: LATER, how: "typed", words: "the word" }],
          },
        ],
        passed: ["takeaway", "picture"],
        sent: [LATER],
      })
    })

    it("sends nothing for an answer said again, then deleted", () => {
      const at = onQuestions({ typed: { what: "typed" } }, [
        take("t1", "spark"),
      ])
      const redone = run(
        [
          tap({ type: "tap", question: "spark" }),
          {
            type: "takes",
            takes: [
              take("t22", "spark", { recordedAt: "2026-11-01T09:03:00.000Z" }),
              take("t1", "spark", { standing: "earlier" }),
            ],
          },
          tap({ type: "askDelete", question: "spark" }),
          tap({ type: "confirmed" }),
        ],
        at
      )
      expect(redone.effects.slice(-2)).toEqual([
        { type: "drop", takes: ["t1"] },
        { type: "deleteTakes", takes: ["t22", "t1"] },
      ])
      const sent = run(
        [
          { type: "takes", takes: [] },
          { type: "deleted", deleted: true },
          tap({ type: "review" }),
          tap({ type: "send" }),
        ],
        redone.state
      )
      const [send] = sent.effects
      expect(send).toMatchObject({ type: "send", takes: [] })
      expect(
        send?.type === "send" &&
          send.idea.answers.map((answer) => answer.question)
      ).toEqual(["what"])
    })

    it("says it was sent once kept, and that nothing was when it wasn't", () => {
      const review = run(
        [tap({ type: "review" })],
        onQuestions({}, [take("t1", "what")])
      ).state
      const idea = bundleIdea(review, LATER)
      const sent = run([{ type: "sentKept", idea }], review).state
      expect(sent.screen).toBe("sent")
      expect(sent.sent).toBe(idea)
      expect(
        run([{ type: "sentKept", idea: null }], review).state
      ).toMatchObject({ screen: "review", notice: "notSent" })
      const another = run(
        [{ type: "another", id: "idea-2", at: LATER }],
        sent
      ).state
      expect(another.screen).toBe("about")
      expect(another.draft.id).toBe("idea-2")
    })
  })

  describe("hearing it all back", () => {
    it("plays each answer's take in order, one after the other", () => {
      const review = run(
        [tap({ type: "review" })],
        onQuestions({}, [take("t1", "what"), take("t333", "picture")])
      ).state
      const started = run([tap({ type: "playAll" })], review)
      expect(started.effects).toEqual([{ type: "play", take: "t1" }])
      const next = run(
        [
          { type: "playing", take: "t1" },
          { type: "playing", take: null },
        ],
        started.state
      )
      expect(next.effects).toEqual([{ type: "play", take: "t333" }])
      const done = run(
        [
          { type: "playing", take: "t333" },
          { type: "playing", take: null },
        ],
        next.state
      )
      expect(done.effects).toEqual([])
      expect(done.state.playAll).toBeNull()
    })

    it("plays from the first answer when one is already playing", () => {
      const review = run(
        [tap({ type: "review" })],
        onQuestions({}, [take("t1", "what"), take("t333", "picture")])
      ).state
      const playing = run(
        [tap({ type: "play", take: "t1" }), { type: "playing", take: "t1" }],
        review
      ).state
      const all = run([tap({ type: "playAll" })], playing)
      expect(all.effects).toEqual([{ type: "stopPlaying" }])
      const started = run([{ type: "playing", take: null }], all.state)
      expect(started.effects).toEqual([{ type: "play", take: "t1" }])
      const next = run(
        [
          { type: "playing", take: "t1" },
          { type: "playing", take: null },
        ],
        started.state
      )
      expect(next.effects).toEqual([{ type: "play", take: "t333" }])
    })

    it("stops on Stop, or on any other play", () => {
      const review = run(
        [tap({ type: "review" })],
        onQuestions({}, [take("t1", "what"), take("t333", "picture")])
      ).state
      const playing = run(
        [tap({ type: "playAll" }), { type: "playing", take: "t1" }],
        review
      ).state
      expect(run([tap({ type: "playAll" })], playing).effects).toEqual([
        { type: "stopPlaying" },
      ])
      const other = run(
        [tap({ type: "play", take: "t333" }), { type: "playing", take: null }],
        playing
      )
      expect(other.effects).toEqual([{ type: "play", take: "t333" }])
      expect(other.state.playAll).toBeNull()
    })
  })
})
