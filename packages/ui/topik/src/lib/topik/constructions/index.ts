/**
 * The construction catalogue (KPLAY's KP1, #2850): the Korean endings that
 * join two clauses, and the endings that close a sentence (KP3, #2852, call
 * C1340), each with what it is, what it does and what it won't allow, so that
 * a scene's focus, a phrase's parts and a spoken match can be proved by code
 * rather than asserted by a model.
 *
 * It is the mistake catalogue's sibling (`read-aloud/mistakes`): an authored
 * table keyed by identifier, where an identifier is identity (adaptive-learning
 * canon Def. 1.3), never renamed and never reused. `CONSTRUCTION_IDS` lists
 * them in the order they were added; the catalogue must hold exactly those, and
 * its test pins every identifier that has landed.
 *
 * An entry is one of two kinds, told apart by `kind`: a `joining` ending
 * (-아서/어서) ends the first of two clauses, and a `closing` ending (-아요/어요,
 * -네요) ends the sentence. Both meet the stem the same way and take the same
 * constraints on what comes before them; a joining ending also says what the
 * clause after it may be, and a closing ending says which clause moods it can
 * end and in which register, so a phrase that joins two clauses can be checked
 * end to end (KP3).
 *
 * Every field is required, so an entry that forgets a constraint does not
 * compile. The constraints are the ones conjugation (KP2) applies to a split:
 * which stems an ending takes, whether the past and -겠- may come before
 * it and its form after them, and what the clause after it must or must
 * not be. A rule no code can apply yet (that
 * -느라고's outcome is usually unwanted) is written in `neighbours`, as what
 * tells it from another ending, not as a constraint.
 *
 * Written by hand, never generated at runtime. `grade` is the International
 * Standard Curriculum for Korean's grade once an entry has been checked
 * against its list, and `"unchecked"` until then (call C1085).
 */

/** What a construction does, in plain terms. */
type Meaning =
  | "cause"
  | "condition"
  | "time"
  | "contrast"
  | "purpose"
  | "background"

/**
 * The shelf a construction is kept on: one of the five jobs a joined pair of
 * clauses does. A basket is chosen from a shelf (KP8).
 */
export type Shelf = Exclude<Meaning, "background">

/** The kinds of stem an ending can attach to. */
export type StemClass =
  /** An action or process: 가다, 먹다, 공부하다. */
  | "verb"
  /** A description: 크다, 좋다, 바쁘다. */
  | "adjective"
  /** 있다 and 없다, and words built on them (맛있다, 재미없다). */
  | "existence"
  /** 이다, the copula: 학생이다, whose stem is 이. */
  | "copula"

/**
 * The ending's own shape, chosen by the stem it meets. What the stem does in
 * turn is conjugation's (KP2): an ㄹ-final stem dropping its ㄹ before ㄴ, ㅂ
 * or ㅅ and taking no 으 (살면, 사는 동안, 산 후에), the irregular classes,
 * contraction (와서), and the honorific -(으)시- before the ending (가시니까).
 * The copula's stem is 이 (학생 + 이 + ㄴ데 → 학생인데).
 */
type Attachment =
  /** The same whatever the stem ends in: 가지만, 먹지만. */
  | { kind: "plain"; ending: string }
  /**
   * One form after a stem ending in a consonant, another after a vowel:
   * 먹으니까, 가니까. A form starting with a lone ㄴ or ㄹ becomes the
   * stem's final consonant: 가 + ㄹ 때 → 갈 때.
   */
  | { kind: "batchim"; afterConsonant: string; afterVowel: string }
  /**
   * Chosen by the stem's last vowel: `bright` after ㅏ or ㅗ (앉아서),
   * `dark` after any other (먹어서), and `ha` after 하다 (하여서, 해서).
   */
  | { kind: "harmony"; bright: string; dark: string; ha: string }
  /** A different shape for each kind of stem: 가는데, 큰데, 있는데, 학생인데. */
  | {
      kind: "by-class"
      verb: SimpleAttachment
      adjective: SimpleAttachment
      existence: SimpleAttachment
      copula: SimpleAttachment
    }

export type SimpleAttachment = Exclude<Attachment, { kind: "by-class" }>

/** A clause type the clause after a joining ending may be refused. */
type Mood =
  /** Telling someone to do it: 가세요, 가. */
  | "command"
  /** Proposing to do it together: 가요 (let's), 갑시다, 가자. */
  | "suggestion"

/** What a whole sentence does: the moods a closing ending can end it in. */
export type ClauseMood =
  /** Saying that something is so: 비가 와요. */
  | "statement"
  /** Asking: 비가 와요? */
  | "question"
  | Mood

/**
 * How the speaker stands to the listener: 해요 (polite, everyday) or 반말
 * (to a friend, a younger person, or to yourself).
 */
export type Register = "해요" | "반말"

/** What a closing ending does, in plain terms. */
type Closes =
  /** Says, asks, tells or proposes, by intonation alone: 가요, 가. */
  | "plain"
  /** Checks what both already think, or wonders aloud: 맞지?, 어디 있지? */
  | "checking"
  /** Remarks on what was just seen or found: 맛있네요. */
  | "noticing"
  /** Offers or proposes, or wonders what will be: 갈까요?, 비가 올까? */
  | "proposing"
  /** Asks the listener, politely, to do it: 앉으세요. */
  | "asking"
  /** Says or asks something of the listener with respect: 바쁘세요? */
  | "honouring"

/** What comes before any ending: the stem it meets, and the tense. */
type Before = {
  /** The stems it attaches to. */
  takes: ReadonlyArray<StemClass>
  /**
   * Whether the past -았/었- may come before it (갔으니까), and with it -겠-
   * (가겠지만), and the ending's form after them. After 았, 었 or 겠 the form
   * no longer depends on the stem: 갔어도, 좋았는데, 갔다면. `null` means the
   * ending takes no tense, and the clause after it carries the time (왔어서
   * is refused).
   */
  before: null | { future: boolean; ending: string }
}

type Constraints = Before & {
  /** What the clause after it may not be. */
  refuses: ReadonlyArray<Mood>
  /** Whether the two clauses must share their subject. */
  subjects: "same" | "any"
  /**
   * What the clause after it must be: its predicate any, or a verb of going
   * and coming (가다, 오다, 다니다), which the vocabulary list (KP2) flags;
   * and its tense any, or the past.
   */
  then: { verb: "any" | "movement"; tense: "any" | "past" }
}

/**
 * Where an entry is checked. The International Standard Curriculum for Korean
 * (국제 통용 한국어 표준 교육과정) gives each grammar item a grade from 1 to 6.
 */
type Grade = 1 | 2 | 3 | 4 | 5 | 6 | "unchecked"

/** The identifiers, in the order they were added. Append only. */
export const CONSTRUCTION_IDS = [
  "conn.aseo.cause",
  "conn.nikka.cause",
  "conn.gi-ttaemune.cause",
  "conn.neurago.cause",
  "conn.neun-barame.cause",
  "conn.myeon.condition",
  "conn.damyeon.condition",
  "conn.l-ttae.time",
  "conn.gi-jeone.time",
  "conn.n-hue.time",
  "conn.go-naseo.time",
  "conn.jamaja.time",
  "conn.neun-dongan.time",
  "conn.myeonseo.time",
  "conn.jiman.contrast",
  "conn.neunde.contrast",
  "conn.ado.contrast",
  "conn.reo.purpose",
  "conn.ryeogo.purpose",
  "conn.gi-wihaeseo.purpose",
  "close.ayo.plain",
  "close.a.plain",
  "close.jiyo.checking",
  "close.ji.checking",
  "close.neyo.noticing",
  "close.ne.noticing",
  "close.lkkayo.proposing",
  "close.lkka.proposing",
  "close.seyo.asking",
] as const

export type ConstructionId = (typeof CONSTRUCTION_IDS)[number]

/** An ending that ends the first of two clauses. */
type Joining = {
  kind: "joining"
  /** How it is written in a grammar list. */
  form: string
  attach: Attachment
  /** What it does; the first is the shelf it is kept on. */
  meanings: readonly [Shelf, ...Array<Meaning>]
  constraints: Constraints
  /** The endings it is easily taken for, and what tells them apart. */
  neighbours: ReadonlyArray<{ id: ConstructionId; differs: string }>
  /**
   * The words that join two separate sentences the same way (비가 왔어요.
   * 그래서 집에 있었어요.), where there are any.
   */
  twins: ReadonlyArray<string>
  grade: Grade
  /** One sentence that uses it, and what it says. */
  example: { ko: string; en: string }
}

/** An ending that closes a sentence. */
type Closing = {
  kind: "closing"
  /** How it is written in a grammar list. */
  form: string
  attach: Attachment
  /** What it does; the first is named in its identifier. */
  meanings: readonly [Closes, ...Array<Closes>]
  register: Register
  constraints: Before & {
    /** The moods it can end a sentence in, by intonation where several. */
    ends: readonly [ClauseMood, ...Array<ClauseMood>]
  }
  /** The endings it is easily taken for, and what tells them apart. */
  neighbours: ReadonlyArray<{ id: ConstructionId; differs: string }>
  grade: Grade
  /** One sentence that uses it, and what it says. */
  example: { ko: string; en: string }
}

export type Construction = Joining | Closing

const ANY_STEM: ReadonlyArray<StemClass> = [
  "verb",
  "adjective",
  "existence",
  "copula",
]

/**
 * Every stem but the copula's: 이다 closes as 이에요/예요 and 이야/야, which no
 * attachment here writes, and the vocabulary list (KP2) lists no copula.
 */
const ANY_STEM_BUT_COPULA: ReadonlyArray<StemClass> = [
  "verb",
  "adjective",
  "existence",
]

/** Action and process verbs only. */
const VERBS: ReadonlyArray<StemClass> = ["verb"]

const NO_TENSE = null

const ANY_THEN = { verb: "any", tense: "any" } as const

const NO_COMMAND_OR_SUGGESTION: ReadonlyArray<Mood> = ["command", "suggestion"]

/**
 * Every mood, chosen by intonation: 가요, 가요?, and 가요 as "go" or "let's go".
 * Only a verb can command or suggest (바빠요 tells no one to be busy); the
 * stem is not related to the mood here, and the phrase check refuses it.
 */
const ANY_MOOD = ["statement", "question", "command", "suggestion"] as const

/** The past and -겠- before it, then the 어 form: 갔어요, 가겠어요. */
const AFTER_TENSE = (ending: string) => ({ future: true, ending }) as const

export const CONSTRUCTIONS = {
  "conn.aseo.cause": {
    kind: "joining",
    form: "-아서/어서",
    attach: { kind: "harmony", bright: "아서", dark: "어서", ha: "여서" },
    meanings: ["cause"],
    constraints: {
      takes: ANY_STEM,
      before: NO_TENSE,
      refuses: NO_COMMAND_OR_SUGGESTION,
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.nikka.cause",
        differs:
          "-(으)니까 may take the past and be followed by a command or a suggestion; -아서/어서 may not. -아서/어서 is the one for thanks and apologies: 늦어서 미안해요.",
      },
      {
        id: "conn.gi-ttaemune.cause",
        differs:
          "-기 때문에 puts weight on the reason and may take the past (왔기 때문에).",
      },
    ],
    twins: ["그래서"],
    grade: "unchecked",
    example: {
      ko: "비가 와서 집에 있었어요.",
      en: "It rained, so I stayed home.",
    },
  },
  "conn.nikka.cause": {
    kind: "joining",
    form: "-(으)니까",
    attach: { kind: "batchim", afterConsonant: "으니까", afterVowel: "니까" },
    meanings: ["cause"],
    constraints: {
      takes: ANY_STEM,
      before: { future: true, ending: "으니까" },
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.aseo.cause",
        differs:
          "-아서/어서 takes no tense and can't be followed by a command or a suggestion.",
      },
    ],
    twins: ["그러니까"],
    grade: "unchecked",
    example: {
      ko: "비가 오니까 우산을 가져가세요.",
      en: "It's raining, so take an umbrella.",
    },
  },
  "conn.gi-ttaemune.cause": {
    kind: "joining",
    form: "-기 때문에",
    attach: { kind: "plain", ending: "기 때문에" },
    meanings: ["cause"],
    constraints: {
      takes: ANY_STEM,
      before: { future: false, ending: "기 때문에" },
      refuses: NO_COMMAND_OR_SUGGESTION,
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.aseo.cause",
        differs:
          "-아서/어서 is the everyday one and takes no tense; -기 때문에 stresses the reason.",
      },
    ],
    twins: ["그렇기 때문에"],
    grade: "unchecked",
    example: {
      ko: "비가 오기 때문에 경기가 취소됐어요.",
      en: "The game was called off because it was raining.",
    },
  },
  "conn.neurago.cause": {
    kind: "joining",
    form: "-느라고",
    attach: { kind: "plain", ending: "느라고" },
    meanings: ["cause"],
    constraints: {
      takes: ["verb", "existence"],
      before: NO_TENSE,
      refuses: NO_COMMAND_OR_SUGGESTION,
      subjects: "same",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.aseo.cause",
        differs:
          "-아서/어서 gives any reason; -느라고 says you were busy doing one thing, so something else didn't happen, usually something wanted.",
      },
      {
        id: "conn.neun-barame.cause",
        differs:
          "-는 바람에 blames something that happened unexpectedly, and the two clauses may have different subjects.",
      },
    ],
    twins: [],
    grade: "unchecked",
    example: {
      ko: "숙제하느라고 잠을 못 잤어요.",
      en: "I was doing homework, so I didn't get any sleep.",
    },
  },
  "conn.neun-barame.cause": {
    kind: "joining",
    form: "-는 바람에",
    attach: { kind: "plain", ending: "는 바람에" },
    meanings: ["cause"],
    constraints: {
      takes: VERBS,
      before: NO_TENSE,
      refuses: NO_COMMAND_OR_SUGGESTION,
      subjects: "any",
      then: { verb: "any", tense: "past" },
    },
    neighbours: [
      {
        id: "conn.neurago.cause",
        differs:
          "-느라고 is about something you chose to be busy with; -는 바람에 is something that happened, usually unexpectedly.",
      },
    ],
    twins: [],
    grade: "unchecked",
    example: {
      ko: "버스를 놓치는 바람에 늦었어요.",
      en: "I missed the bus, so I was late.",
    },
  },
  "conn.myeon.condition": {
    kind: "joining",
    form: "-(으)면",
    attach: { kind: "batchim", afterConsonant: "으면", afterVowel: "면" },
    meanings: ["condition"],
    constraints: {
      takes: ANY_STEM,
      before: { future: false, ending: "으면" },
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.damyeon.condition",
        differs:
          "-다면 supposes something less likely, or only imagined; -(으)면 is any if or when.",
      },
      {
        id: "conn.l-ttae.time",
        differs: "-(으)ㄹ 때 says when something happens, not whether it does.",
      },
    ],
    twins: ["그러면"],
    grade: "unchecked",
    example: {
      ko: "시간이 있으면 같이 가요.",
      en: "If you have time, let's go together.",
    },
  },
  "conn.damyeon.condition": {
    kind: "joining",
    form: "-ㄴ다면/는다면/다면",
    attach: {
      kind: "by-class",
      verb: { kind: "batchim", afterConsonant: "는다면", afterVowel: "ㄴ다면" },
      adjective: { kind: "plain", ending: "다면" },
      existence: { kind: "plain", ending: "다면" },
      copula: { kind: "plain", ending: "라면" },
    },
    meanings: ["condition"],
    constraints: {
      takes: ANY_STEM,
      before: { future: false, ending: "다면" },
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.myeon.condition",
        differs: "-(으)면 is the everyday if; -다면 supposes.",
      },
    ],
    twins: ["그렇다면"],
    grade: "unchecked",
    example: {
      ko: "복권에 당첨된다면 세계 여행을 할 거예요.",
      en: "If I won the lottery, I'd travel the world.",
    },
  },
  "conn.l-ttae.time": {
    kind: "joining",
    form: "-(으)ㄹ 때",
    attach: { kind: "batchim", afterConsonant: "을 때", afterVowel: "ㄹ 때" },
    meanings: ["time"],
    constraints: {
      takes: ANY_STEM,
      before: { future: false, ending: "을 때" },
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.neun-dongan.time",
        differs:
          "-는 동안 is the whole stretch while something goes on; -(으)ㄹ 때 is the time it happens.",
      },
    ],
    twins: ["그때"],
    grade: "unchecked",
    example: {
      ko: "어렸을 때 부산에 살았어요.",
      en: "When I was little, I lived in Busan.",
    },
  },
  "conn.gi-jeone.time": {
    kind: "joining",
    form: "-기 전에",
    attach: { kind: "plain", ending: "기 전에" },
    meanings: ["time"],
    constraints: {
      takes: VERBS,
      before: NO_TENSE,
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.n-hue.time",
        differs: "-(으)ㄴ 후에 is after; -기 전에 is before.",
      },
    ],
    twins: ["그전에"],
    grade: "unchecked",
    example: {
      ko: "자기 전에 이를 닦아요.",
      en: "I brush my teeth before I go to bed.",
    },
  },
  "conn.n-hue.time": {
    kind: "joining",
    form: "-(으)ㄴ 후에",
    attach: {
      kind: "batchim",
      afterConsonant: "은 후에",
      afterVowel: "ㄴ 후에",
    },
    meanings: ["time"],
    constraints: {
      takes: VERBS,
      before: NO_TENSE,
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.go-naseo.time",
        differs:
          "-고 나서 stresses finishing the first thing before the second, and both are done by the same person.",
      },
      {
        id: "conn.gi-jeone.time",
        differs: "-기 전에 is before; -(으)ㄴ 후에 is after.",
      },
    ],
    twins: ["그 후에"],
    grade: "unchecked",
    example: {
      ko: "밥을 먹은 후에 산책해요.",
      en: "After I eat, I go for a walk.",
    },
  },
  "conn.go-naseo.time": {
    kind: "joining",
    form: "-고 나서",
    attach: { kind: "plain", ending: "고 나서" },
    meanings: ["time"],
    constraints: {
      takes: VERBS,
      before: NO_TENSE,
      refuses: [],
      subjects: "same",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.n-hue.time",
        differs:
          "-(으)ㄴ 후에 only orders the two, and the two clauses may have different subjects.",
      },
      {
        id: "conn.jamaja.time",
        differs: "-자마자 says the second came the moment the first did.",
      },
    ],
    twins: ["그러고 나서"],
    grade: "unchecked",
    example: {
      ko: "숙제를 하고 나서 놀아요.",
      en: "I finish my homework, then I play.",
    },
  },
  "conn.jamaja.time": {
    kind: "joining",
    form: "-자마자",
    attach: { kind: "plain", ending: "자마자" },
    meanings: ["time"],
    constraints: {
      takes: VERBS,
      before: NO_TENSE,
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.go-naseo.time",
        differs: "-고 나서 says only that the first was finished first.",
      },
    ],
    twins: [],
    grade: "unchecked",
    example: {
      ko: "집에 도착하자마자 잠들었어요.",
      en: "I fell asleep the moment I got home.",
    },
  },
  "conn.neun-dongan.time": {
    kind: "joining",
    form: "-는 동안",
    attach: { kind: "plain", ending: "는 동안" },
    meanings: ["time"],
    constraints: {
      takes: ["verb", "existence"],
      before: NO_TENSE,
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.myeonseo.time",
        differs:
          "-(으)면서 is one person doing two things at once; with -는 동안 someone else may do the second.",
      },
      {
        id: "conn.l-ttae.time",
        differs:
          "-(으)ㄹ 때 is a point in time; -는 동안 is the whole stretch.",
      },
    ],
    twins: ["그동안"],
    grade: "unchecked",
    example: {
      ko: "친구를 기다리는 동안 책을 읽었어요.",
      en: "I read a book while I waited for my friend.",
    },
  },
  "conn.myeonseo.time": {
    kind: "joining",
    form: "-(으)면서",
    attach: { kind: "batchim", afterConsonant: "으면서", afterVowel: "면서" },
    meanings: ["time"],
    constraints: {
      takes: ANY_STEM,
      before: NO_TENSE,
      refuses: [],
      subjects: "same",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.neun-dongan.time",
        differs:
          "-는 동안 lets someone else do the second thing; -(으)면서 is one person doing both.",
      },
    ],
    twins: [],
    grade: "unchecked",
    example: {
      ko: "음악을 들으면서 운동해요.",
      en: "I work out while I listen to music.",
    },
  },
  "conn.jiman.contrast": {
    kind: "joining",
    form: "-지만",
    attach: { kind: "plain", ending: "지만" },
    meanings: ["contrast"],
    constraints: {
      takes: ANY_STEM,
      before: { future: true, ending: "지만" },
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.neunde.contrast",
        differs:
          "-는데 is softer, and often only sets the scene for what follows.",
      },
      {
        id: "conn.ado.contrast",
        differs:
          "-아도/어도 is even if: the second holds whatever the first is.",
      },
    ],
    twins: ["하지만", "그렇지만"],
    grade: "unchecked",
    example: {
      ko: "비싸지만 맛있어요.",
      en: "It's expensive, but it's good.",
    },
  },
  "conn.neunde.contrast": {
    kind: "joining",
    form: "-는데/(으)ㄴ데",
    attach: {
      kind: "by-class",
      verb: { kind: "plain", ending: "는데" },
      adjective: {
        kind: "batchim",
        afterConsonant: "은데",
        afterVowel: "ㄴ데",
      },
      existence: { kind: "plain", ending: "는데" },
      copula: { kind: "plain", ending: "ㄴ데" },
    },
    meanings: ["contrast", "background"],
    constraints: {
      takes: ANY_STEM,
      before: { future: true, ending: "는데" },
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.jiman.contrast",
        differs: "-지만 is a plain but, and never only sets the scene.",
      },
    ],
    twins: ["그런데"],
    grade: "unchecked",
    example: {
      ko: "어제 시장에 갔는데 사람이 많았어요.",
      en: "I went to the market yesterday, and it was packed.",
    },
  },
  "conn.ado.contrast": {
    kind: "joining",
    form: "-아도/어도",
    attach: { kind: "harmony", bright: "아도", dark: "어도", ha: "여도" },
    meanings: ["contrast"],
    constraints: {
      takes: ANY_STEM,
      before: { future: false, ending: "어도" },
      refuses: [],
      subjects: "any",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.jiman.contrast",
        differs:
          "-지만 sets two facts against each other; -아도/어도 says the second holds anyway.",
      },
    ],
    twins: ["그래도"],
    grade: "unchecked",
    example: {
      ko: "비가 와도 갈 거예요.",
      en: "I'll go even if it rains.",
    },
  },
  "conn.reo.purpose": {
    kind: "joining",
    form: "-(으)러",
    attach: { kind: "batchim", afterConsonant: "으러", afterVowel: "러" },
    meanings: ["purpose"],
    constraints: {
      takes: VERBS,
      before: NO_TENSE,
      refuses: [],
      subjects: "same",
      then: { verb: "movement", tense: "any" },
    },
    neighbours: [
      {
        id: "conn.ryeogo.purpose",
        differs:
          "-(으)려고 may be followed by any verb, but not by a command or a suggestion; -(으)러 is followed by going or coming.",
      },
    ],
    twins: [],
    grade: "unchecked",
    example: {
      ko: "빵을 사러 가게에 가요.",
      en: "I'm going to the shop to buy bread.",
    },
  },
  "conn.ryeogo.purpose": {
    kind: "joining",
    form: "-(으)려고",
    attach: { kind: "batchim", afterConsonant: "으려고", afterVowel: "려고" },
    meanings: ["purpose"],
    constraints: {
      takes: VERBS,
      before: NO_TENSE,
      refuses: NO_COMMAND_OR_SUGGESTION,
      subjects: "same",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.reo.purpose",
        differs: "-(으)러 is only for going or coming somewhere to do it.",
      },
      {
        id: "conn.gi-wihaeseo.purpose",
        differs:
          "-기 위해서 is more formal and may be followed by a command or a suggestion.",
      },
    ],
    twins: [],
    grade: "unchecked",
    example: {
      ko: "한국어를 배우려고 학원에 다녀요.",
      en: "I go to a language school to learn Korean.",
    },
  },
  "conn.gi-wihaeseo.purpose": {
    kind: "joining",
    form: "-기 위해서",
    attach: { kind: "plain", ending: "기 위해서" },
    meanings: ["purpose"],
    constraints: {
      takes: VERBS,
      before: NO_TENSE,
      refuses: [],
      subjects: "same",
      then: ANY_THEN,
    },
    neighbours: [
      {
        id: "conn.ryeogo.purpose",
        differs:
          "-(으)려고 is the everyday one, and can't be followed by a command or a suggestion.",
      },
    ],
    twins: ["그러기 위해서"],
    grade: "unchecked",
    example: {
      ko: "건강을 지키기 위해서 매일 걸어요.",
      en: "I walk every day to stay healthy.",
    },
  },
  "close.ayo.plain": {
    kind: "closing",
    form: "-아요/어요",
    attach: { kind: "harmony", bright: "아요", dark: "어요", ha: "여요" },
    meanings: ["plain"],
    register: "해요",
    constraints: {
      takes: ANY_STEM_BUT_COPULA,
      before: AFTER_TENSE("어요"),
      ends: ANY_MOOD,
    },
    neighbours: [
      {
        id: "close.a.plain",
        differs: "-아/어 is the same ending without 요, to a friend.",
      },
      {
        id: "close.neyo.noticing",
        differs:
          "-네요 remarks on something just noticed; -아요/어요 just says it.",
      },
    ],
    grade: "unchecked",
    example: { ko: "오늘 비가 와요.", en: "It's raining today." },
  },
  "close.a.plain": {
    kind: "closing",
    form: "-아/어",
    attach: { kind: "harmony", bright: "아", dark: "어", ha: "여" },
    meanings: ["plain"],
    register: "반말",
    constraints: {
      takes: ANY_STEM_BUT_COPULA,
      before: AFTER_TENSE("어"),
      ends: ANY_MOOD,
    },
    neighbours: [
      {
        id: "close.ayo.plain",
        differs: "-아요/어요 adds 요, for someone you aren't close to.",
      },
    ],
    grade: "unchecked",
    example: { ko: "나 지금 가.", en: "I'm going now." },
  },
  "close.jiyo.checking": {
    kind: "closing",
    form: "-지요",
    attach: { kind: "plain", ending: "지요" },
    meanings: ["checking"],
    register: "해요",
    constraints: {
      takes: ANY_STEM_BUT_COPULA,
      before: AFTER_TENSE("지요"),
      // 같이 가지요 proposes, and 이쪽으로 오시지요 asks.
      ends: ANY_MOOD,
    },
    neighbours: [
      {
        id: "close.ayo.plain",
        differs:
          "-지요 assumes the listener already knows or agrees (맛있지요?); -아요/어요 tells them something new.",
      },
      {
        id: "close.ji.checking",
        differs:
          "-지 is the same ending without 요, to a friend or to yourself.",
      },
    ],
    grade: "unchecked",
    example: { ko: "이거 맛있지요?", en: "This is good, isn't it?" },
  },
  "close.ji.checking": {
    kind: "closing",
    form: "-지",
    attach: { kind: "plain", ending: "지" },
    meanings: ["checking"],
    register: "반말",
    constraints: {
      takes: ANY_STEM_BUT_COPULA,
      before: AFTER_TENSE("지"),
      // 너도 같이 가지 proposes, or tells.
      ends: ANY_MOOD,
    },
    neighbours: [
      {
        id: "close.jiyo.checking",
        differs: "-지요 adds 요, for someone you aren't close to.",
      },
    ],
    grade: "unchecked",
    example: { ko: "내 폰 어디 있지?", en: "Where's my phone?" },
  },
  "close.neyo.noticing": {
    kind: "closing",
    form: "-네요",
    attach: { kind: "plain", ending: "네요" },
    meanings: ["noticing"],
    register: "해요",
    constraints: {
      takes: ANY_STEM_BUT_COPULA,
      before: AFTER_TENSE("네요"),
      ends: ["statement"],
    },
    neighbours: [
      {
        id: "close.ayo.plain",
        differs:
          "-아요/어요 says what is so; -네요 says it as something just seen, heard or tasted.",
      },
      {
        id: "close.ne.noticing",
        differs:
          "-네 is the same ending without 요, to a friend or to yourself.",
      },
    ],
    grade: "unchecked",
    example: {
      ko: "음식이 정말 맛있네요.",
      en: "Oh, the food is really good.",
    },
  },
  "close.ne.noticing": {
    kind: "closing",
    form: "-네",
    attach: { kind: "plain", ending: "네" },
    meanings: ["noticing"],
    register: "반말",
    constraints: {
      takes: ANY_STEM_BUT_COPULA,
      before: AFTER_TENSE("네"),
      ends: ["statement"],
    },
    neighbours: [
      {
        id: "close.neyo.noticing",
        differs: "-네요 adds 요, for someone you aren't close to.",
      },
    ],
    grade: "unchecked",
    example: { ko: "벌써 다 먹었네.", en: "Oh, you've already eaten it all." },
  },
  "close.lkkayo.proposing": {
    kind: "closing",
    form: "-(으)ㄹ까요?",
    attach: { kind: "batchim", afterConsonant: "을까요", afterVowel: "ㄹ까요" },
    meanings: ["proposing"],
    register: "해요",
    constraints: {
      takes: ANY_STEM_BUT_COPULA,
      before: { future: false, ending: "을까요" },
      ends: ["suggestion", "question"],
    },
    neighbours: [
      {
        id: "close.ayo.plain",
        differs:
          "-아요/어요 can propose too (같이 가요), as a plan; -(으)ㄹ까요? asks what the listener thinks first.",
      },
      {
        id: "close.lkka.proposing",
        differs:
          "-(으)ㄹ까? is the same ending without 요, to a friend or to yourself.",
      },
    ],
    grade: "unchecked",
    example: { ko: "같이 커피 마실까요?", en: "Shall we get a coffee?" },
  },
  "close.lkka.proposing": {
    kind: "closing",
    form: "-(으)ㄹ까?",
    attach: { kind: "batchim", afterConsonant: "을까", afterVowel: "ㄹ까" },
    meanings: ["proposing"],
    register: "반말",
    constraints: {
      takes: ANY_STEM_BUT_COPULA,
      before: { future: false, ending: "을까" },
      ends: ["suggestion", "question"],
    },
    neighbours: [
      {
        id: "close.lkkayo.proposing",
        differs: "-(으)ㄹ까요? adds 요, for someone you aren't close to.",
      },
    ],
    grade: "unchecked",
    example: { ko: "내일 비가 올까?", en: "Do you think it'll rain tomorrow?" },
  },
  "close.seyo.asking": {
    kind: "closing",
    form: "-(으)세요",
    attach: { kind: "batchim", afterConsonant: "으세요", afterVowel: "세요" },
    meanings: ["asking", "honouring"],
    register: "해요",
    constraints: {
      // -(으)시- and -어요: a request, of an action only (앉으세요), or a
      // statement or question that honours its subject, of any stem
      // (바쁘세요?, 시간 있으세요?). Which stems may ask is a rule of the
      // mood, which no constraint here relates; the past is -(으)셨어요.
      takes: ANY_STEM_BUT_COPULA,
      before: NO_TENSE,
      ends: ["command", "statement", "question"],
    },
    neighbours: [
      {
        id: "close.ayo.plain",
        differs:
          "-아요/어요 can tell someone to do it too (빨리 와요); -(으)세요 asks with respect, and honours whoever it is about (바쁘세요?). Only an action can be asked for.",
      },
    ],
    grade: "unchecked",
    example: { ko: "여기 앉으세요.", en: "Please have a seat here." },
  },
} as const satisfies Record<ConstructionId, Construction>
