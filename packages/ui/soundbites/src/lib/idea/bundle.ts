/**
 * A new idea as one bundle (STUDIO ST26, #2453): what it is (its title,
 * topic, keywords and format), then its questions, one card each, swiped
 * between, each answer said as a take on the take pattern and heard back,
 * then the whole idea looked over and sent together.
 *
 * The machine, and the rules it holds by structure, are the shared
 * bundle's (`@some-ui/voice-capture`'s `bundleMachine`). This is the idea's
 * spec over it:
 *
 * - **The questions** are `IDEA_QUESTIONS`, each take named
 *   `idea:<idea>:<question>` (`answersOf`), a Studio note's `ref`.
 * - **What it is** is the draft's `about`, edited on the screen before the
 *   questions (`IdeaEdit`); a topic or keyword is one of home's lists.
 * - **Send needs a title and the first answer**; the other questions can
 *   wait (the owner, #2453), and go as passed over.
 * - **What Send keeps** is the `Idea`, whole and dated, with the ideas kept
 *   (`./store`).
 * - **Typing** is offered when voice doesn't come through (ST34).
 */
import { assertNever } from "@some-ui/core-utils"
import type {
  BundleAnswer,
  BundleSpec,
  BundleEffect as Effect,
  BundleEvent as Event,
  BundleIntent as Intent,
  BundleState as State,
} from "@some-ui/voice-capture"
import { bundleMachine } from "@some-ui/voice-capture"

import type { IdeaDraft, IdeaLists } from "./draft"
import { answersOf, IDEA_LISTS_SEED, newDraft } from "./draft"
import type { Idea, IdeaFormat, QuestionId } from "./model"
import { IDEA_QUESTIONS, isRequired, TITLE_MAX, TYPED_MAX } from "./model"

/** The questions' version a bundle answers. */
const QUESTIONS_VERSION = 1

/** What the screen before the questions edits of the idea. */
export type IdeaEdit =
  | { readonly type: "format"; readonly format: IdeaFormat }
  | { readonly type: "title"; readonly text: string }
  | { readonly type: "topic"; readonly topic: string }
  | { readonly type: "keyword"; readonly keyword: string }

export type IdeaBundleKind = {
  readonly item: QuestionId
  readonly draft: IdeaDraft
  readonly record: Idea
  readonly edit: IdeaEdit
  readonly context: IdeaLists
  readonly need: "title"
}

export type BundleState = State<IdeaBundleKind>
export type BundleEvent = Event<IdeaBundleKind>
export type BundleEffect = Effect<IdeaBundleKind>
export type BundleIntent = Intent<IdeaBundleKind>

function edit(draft: IdeaDraft, change: IdeaEdit, lists: IdeaLists): IdeaDraft {
  const { about } = draft
  switch (change.type) {
    case "format": {
      return about.format === change.format
        ? draft
        : { ...draft, about: { ...about, format: change.format } }
    }
    case "title": {
      const title = change.text.slice(0, TITLE_MAX)
      return title === about.title
        ? draft
        : { ...draft, about: { ...about, title } }
    }
    case "topic": {
      if (!lists.topics.includes(change.topic)) return draft
      return about.topic === change.topic
        ? draft
        : { ...draft, about: { ...about, topic: change.topic } }
    }
    case "keyword": {
      const { keywords } = about
      if (keywords.includes(change.keyword)) {
        return {
          ...draft,
          about: {
            ...about,
            keywords: keywords.filter((each) => each !== change.keyword),
          },
        }
      }
      if (!lists.keywords.includes(change.keyword)) return draft
      return {
        ...draft,
        about: { ...about, keywords: [...keywords, change.keyword] },
      }
    }
    default: {
      return assertNever(change)
    }
  }
}

/**
 * The idea a draft sends: what it is, each answer said (its one take) or
 * typed, and the questions with neither passed over.
 */
function ideaOf(
  draft: IdeaDraft,
  said: ReadonlyArray<BundleAnswer<QuestionId>>,
  passed: ReadonlyArray<QuestionId>,
  at: string
): Idea {
  const answers = said.map(({ item, take, typed }) => {
    const versions =
      typed === null ? [] : [{ at, how: "typed" as const, words: typed }]
    return take === null
      ? { question: item, versions }
      : {
          question: item,
          versions,
          takes: [{ at: take.at, take: take.id }],
        }
  })
  return {
    id: draft.id,
    at: draft.at,
    questions: QUESTIONS_VERSION,
    answers,
    passed,
    about: { ...draft.about, title: draft.about.title.trim() },
    sent: [at],
  }
}

const IDEA_BUNDLE_SPEC: BundleSpec<IdeaBundleKind> = {
  items: IDEA_QUESTIONS,
  answersOf,
  required: isRequired,
  typing: true,
  typedMax: TYPED_MAX,
  withAnswers: (draft, answers) => ({ about: draft.about, ...answers }),
  fresh: newDraft,
  edit,
  missing: (draft) => (draft.about.title.trim() === "" ? "title" : null),
  resumesOnCards: (draft) => draft.about.title !== "",
  record: ideaOf,
  idOf: (idea) => idea.id,
  named: (idea) =>
    idea.answers.flatMap((answer) =>
      (answer.takes ?? []).map((each) => each.take)
    ),
  resends: false,
  closed: () => false,
}

/** The idea's bundle: the shared machine over the idea's spec. */
export const IDEA_BUNDLE = bundleMachine(IDEA_BUNDLE_SPEC)

export const { stepBundle, answeredCount, missing, cardView } = IDEA_BUNDLE

export function initialBundle(id: string, at: string): BundleState {
  return IDEA_BUNDLE.initial(IDEA_LISTS_SEED, id, at)
}

/** The idea a draft sends at `at`. */
export const bundleIdea = (
  state: Pick<BundleState, "draft" | "takes">,
  at: string
): Idea => IDEA_BUNDLE.bundleRecord(state, at)
