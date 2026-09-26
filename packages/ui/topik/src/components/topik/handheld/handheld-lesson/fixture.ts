/**
 * A small topik for stories and tests: two conversations, with one of each
 * kind of check the handheld lesson realises - a multiple-choice selection, a
 * word-tile assembly, a syllable-tile assembly, and a free-text item that
 * cannot be tiled and falls back to a selection.
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
