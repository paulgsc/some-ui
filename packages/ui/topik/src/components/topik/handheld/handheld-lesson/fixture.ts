/**
 * A small topik for stories and tests: two conversations at a café counter.
 *
 * `questions` are the first-order items the desktop quiz asks; the handheld
 * lesson never does (canon Cor. 4.5). `probes` are what it asks instead, one
 * of each kind: odd-one-out over structural transformations, pick-valid over
 * replies and register, and build-from-tiles. Conversation 2's second line
 * carries two probes, which is the case the gloss gate exists for.
 */

import type {
  ConversationBatch,
  ITopikMetadataRepository,
  ITopikRepository,
  TopikManifestFile,
} from "@topik/lib/topik"

export const FIXTURE_TOPIK_KEY = "cafe-order"

export const FIXTURE_BATCHES: Array<ConversationBatch> = [
  {
    id: 1,
    messages: [
      {
        id: "c1-m1",
        role: "assistant",
        content: "어서 오세요. 뭐 드릴까요?",
        korean: "어서 오세요. 뭐 드릴까요?",
        english: "Welcome. What can I get you?",
        timestamp: "09:00",
      },
      {
        id: "c1-m2",
        role: "user",
        content: "아이스 아메리카노 한 잔 주세요.",
        korean: "아이스 아메리카노 한 잔 주세요.",
        english: "One iced americano, please.",
        timestamp: "09:00",
      },
      {
        id: "c1-m3",
        role: "assistant",
        content: "여기서 드시고 가세요?",
        korean: "여기서 드시고 가세요?",
        english: "Is that for here?",
        timestamp: "09:01",
      },
      {
        id: "c1-m4",
        role: "user",
        content: "아니요, 포장해 주세요.",
        korean: "아니요, 포장해 주세요.",
        english: "No, to go please.",
        timestamp: "09:01",
      },
    ],
    probes: [
      {
        id: "c1-reply",
        kind: "pick-valid",
        order: 3,
        anchorMessageId: "c1-m1",
        prompt: "The server asks what you'd like. Which reply fits?",
        options: [
          {
            text: "아이스 아메리카노 한 잔 주세요.",
            relation: "reply",
            valid: true,
            why: "Answers the question with a polite request - what the server is waiting for.",
          },
          {
            text: "네, 어서 오세요.",
            relation: "reply",
            valid: false,
            why: "어서 오세요 is the shop's welcome; a customer never says it back.",
          },
          {
            text: "뭐 드릴까요?",
            relation: "reply",
            valid: false,
            why: "That is the server's own question - 드리다 is humbly giving, so only the one serving asks it.",
          },
          {
            text: "잘 먹겠습니다.",
            relation: "reply",
            valid: false,
            why: "Said just before eating a meal someone gives you, not when ordering.",
          },
        ],
      },
      {
        id: "c1-request-forms",
        kind: "odd-one-out",
        order: 2,
        anchorMessageId: "c1-m2",
        prompt: "Which is NOT a valid transformation of this request?",
        options: [
          {
            text: "아이스 아메리카노 한 잔 부탁해요.",
            relation: "paraphrase",
            valid: true,
            why: "부탁해요 (I ask it of you) is another polite way to request.",
          },
          {
            text: "아이스 아메리카노 한 잔 주시겠어요?",
            relation: "register",
            label: "More polite",
            valid: true,
            why: "-시겠어요? softens the request into a deferential question.",
          },
          {
            text: "아이스 아메리카노 한 잔 안 주세요.",
            relation: "negation",
            valid: false,
            why: "안 cannot negate a request. Asking someone not to do something takes -지 마세요: 주지 마세요.",
          },
          {
            text: "아이스 아메리카노 한 잔 주실 수 있어요?",
            relation: "question",
            valid: true,
            why: "-(으)ㄹ 수 있어요? asks whether they can - a request put as a question.",
          },
        ],
      },
      {
        id: "c1-honorific",
        kind: "pick-valid",
        order: 3,
        anchorMessageId: "c1-m3",
        prompt: "Why does the server say 드시고 and not 먹고?",
        options: [
          {
            text: "It honours the customer: 드시다 is the respectful 먹다",
            relation: "register",
            lang: "en",
            valid: true,
            why: "Talking about the customer's eating, the server raises them with the honorific verb.",
          },
          {
            text: "It puts the sentence in the past tense",
            relation: "past",
            lang: "en",
            valid: false,
            why: "Nothing here is past: 드시고 is 드시다 + -고, 'eat and...'.",
          },
          {
            text: "It turns the sentence into a question",
            relation: "question",
            lang: "en",
            valid: false,
            why: "The question comes from the rising -세요?, not from the verb.",
          },
          {
            text: "It is the more casual word",
            relation: "register",
            lang: "en",
            valid: false,
            why: "The reverse: 먹다 is the plain verb, 드시다 the respectful one.",
          },
        ],
      },
      {
        id: "c1-build-negation",
        kind: "build",
        order: 2,
        anchorMessageId: "c1-m4",
        source: "포장해 주세요.",
        prompt: "Ask them NOT to pack it.",
        relation: "negation",
        target: "포장하지 마세요",
        acceptedAnswers: ["포장하지 마세요."],
        distractors: ["안", "주세요", "못"],
        explanation:
          "A negative request is verb stem + -지 마세요. 안 and 못 negate statements, never requests.",
      },
    ],
    questions: [
      {
        type: "multiple-choice",
        korean: "아이스 아메리카노 한 잔 주세요",
        question: "What did the customer order?",
        options: [
          "A hot latte",
          "One iced americano",
          "Two iced teas",
          "A cake",
        ],
        correct: 1,
        correctAnswer: "One iced americano",
        explanation: "한 잔 is 'one cup'; 주세요 is a polite request.",
      },
      {
        type: "text-input",
        korean: "포장해 주세요",
        question: "Build how the customer asked for it to go.",
        acceptedAnswers: ["포장해 주세요"],
        correctAnswer: "포장해 주세요",
        explanation: "포장 is packaging - 'take-out' in a café.",
        grammarNote: "-해 주세요: please do (it) for me.",
      },
    ],
  },
  {
    id: 2,
    messages: [
      {
        id: "c2-m1",
        role: "assistant",
        content: "사천오백 원입니다.",
        korean: "사천오백 원입니다.",
        english: "That's 4,500 won.",
        timestamp: "09:02",
      },
      {
        id: "c2-m2",
        role: "user",
        content: "카드로 할게요. 감사합니다.",
        korean: "카드로 할게요. 감사합니다.",
        english: "I'll pay by card. Thank you.",
        timestamp: "09:02",
      },
    ],
    probes: [
      {
        id: "c2-rude",
        kind: "pick-valid",
        order: 3,
        anchorMessageId: "c2-m1",
        prompt: "Which reply would come across as rude to the cashier?",
        options: [
          {
            text: "카드로 할게요.",
            relation: "reply",
            valid: false,
            why: "A polite -요 ending: an ordinary answer.",
          },
          {
            text: "여기요.",
            relation: "reply",
            valid: false,
            why: "'Here you go' as you hand the card over - perfectly polite.",
          },
          {
            text: "비싸네. 카드.",
            relation: "reply",
            valid: true,
            why: "Plain speech (반말) to a stranger, then a bare noun as an order: curt and rude.",
          },
          {
            text: "감사합니다.",
            relation: "reply",
            valid: false,
            why: "Thanking is always fine.",
          },
        ],
      },
      {
        id: "c2-promise-forms",
        kind: "odd-one-out",
        order: 2,
        anchorMessageId: "c2-m2",
        source: "카드로 할게요.",
        prompt: "Which is NOT a valid transformation?",
        options: [
          {
            text: "카드로 했어요.",
            relation: "past",
            valid: true,
            why: "했어요: I paid by card.",
          },
          {
            text: "카드로 안 할게요.",
            relation: "negation",
            valid: true,
            why: "안 before the verb: I won't pay by card.",
          },
          {
            text: "카드로 계산할게요.",
            relation: "paraphrase",
            valid: true,
            why: "계산하다 (to settle the bill) says the same thing, more precisely.",
          },
          {
            text: "카드로 할게요?",
            relation: "question",
            valid: false,
            why: "-ㄹ게요 is a promise about your own next move and has no question form. Ask with 할까요? instead.",
          },
        ],
      },
      {
        id: "c2-build-past",
        kind: "build",
        order: 2,
        anchorMessageId: "c2-m2",
        source: "카드로 할게요.",
        prompt: "Say you already paid by card.",
        relation: "past",
        target: "카드로 했어요",
        acceptedAnswers: ["카드로 했어요."],
        distractors: ["할게요", "카드를", "하세요"],
        explanation:
          "-ㄹ게요 (I will) becomes -았/었어요 (I did): 하 + 였어요 = 했어요.",
      },
    ],
    questions: [
      {
        type: "text-input",
        korean: "감사합니다",
        question: "Build 'thank you'.",
        acceptedAnswers: ["감사합니다"],
        correctAnswer: "감사합니다",
        explanation: "The formal 'thank you'.",
      },
      {
        type: "text-input",
        korean: "카드로 할게요",
        question: "How is the customer paying? (one word)",
        acceptedAnswers: ["card"],
        correctAnswer: "card",
        explanation: "카드로 - by card.",
      },
    ],
  },
]

export const FIXTURE_MANIFEST: TopikManifestFile = {
  version: "1",
  topiks: [
    {
      key: FIXTURE_TOPIK_KEY,
      displayName: "Ordering at a café",
      description: "Two short exchanges at a coffee counter.",
      batchCount: FIXTURE_BATCHES.length,
      totalQuestions: 4,
      totalMessages: 6,
      difficulty: "beginner",
    },
    {
      key: "subway-transfer",
      displayName: "Changing subway lines",
      description: "Asking a station attendant for directions.",
      batchCount: 3,
      totalQuestions: 9,
      totalMessages: 14,
      difficulty: "intermediate",
    },
  ],
}

export const fixtureTopikRepository: ITopikRepository = {
  load: (key) =>
    key === FIXTURE_TOPIK_KEY
      ? Promise.resolve(FIXTURE_BATCHES)
      : Promise.reject(new Error(`No fixture for ${key}`)),
}

export const fixtureMetadataRepository: ITopikMetadataRepository = {
  loadCatalog: () => Promise.resolve(FIXTURE_MANIFEST),
}
