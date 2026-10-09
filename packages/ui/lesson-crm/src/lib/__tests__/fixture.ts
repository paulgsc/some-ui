/** A one-conversation lesson that passes intake cleanly. */
export const LESSON = [
  {
    id: 1,
    messages: [
      {
        id: "m1",
        role: "assistant",
        content: "뭐 드릴까요?",
        korean: "뭐 드릴까요?",
        english: "What can I get you?",
        timestamp: "09:00",
      },
      {
        id: "m2",
        role: "user",
        content: "커피 한 잔 주세요.",
        korean: "커피 한 잔 주세요.",
        english: "One coffee, please.",
        timestamp: "09:00",
      },
    ],
    questions: [
      {
        type: "text-input",
        korean: "커피 한 잔 주세요.",
        question: "What did the customer order?",
        correctAnswer: "coffee",
        explanation: "커피 is coffee.",
      },
    ],
  },
]

/** A model's reply: the lesson and its manifest entry, fenced. */
export const REPLY = [
  "Here is the lesson.",
  "```json",
  JSON.stringify(LESSON, null, 2),
  "```",
  "```json",
  JSON.stringify({
    key: "Cafe Order",
    displayName: "At the café",
    description: "Ordering a coffee.",
    tags: ["topik-1", "cafe"],
  }),
  "```",
].join("\n")

const leaf = (id: string, feeling: string): Record<string, unknown> => ({
  id,
  place: "카페",
  feeling,
  beats: [
    { id: `${id}-n1`, text: "손님이 기다린다.", gloss: "A customer waits." },
  ],
})

/**
 * A scene tree that passes both audits (docs/makjang/README.md): one root
 * choice, each option a leaf. Synthetic: the smallest tree a check reads.
 */
export const TREE = {
  id: "cafe-tree",
  level: 1,
  pov: "guest",
  cast: [
    { id: "guest", name: "손님", standing: "a customer", registers: {} },
    { id: "clerk", name: "직원", standing: "the clerk", registers: {} },
  ],
  root: {
    id: "s1",
    place: "카페",
    feeling: "tension",
    beats: [
      {
        id: "s1-l1",
        speaker: "clerk",
        text: "뭐 드릴까요?",
        gloss: "What can I get you?",
      },
    ],
    choice: {
      id: "c1",
      prompt: "뭐라고 할까?",
      check: {
        id: "c1-reply",
        kind: "pick-valid",
        order: 3,
        source: "뭐 드릴까요?",
        prompt: "Which reply fits?",
        options: [
          {
            id: "a",
            text: "커피 한 잔 주세요.",
            relation: "reply",
            valid: true,
            why: "It orders politely.",
          },
          {
            id: "b",
            text: "커피 한 잔 줘.",
            relation: "reply",
            valid: false,
            why: "반말 to a clerk is rude.",
          },
        ],
      },
      options: [
        { id: "a", child: leaf("s2", "warmth") },
        { id: "b", child: leaf("s3", "chill") },
      ],
    },
  },
}

/** The tree as a model returns it: one fenced block. */
export const treeReply = (tree: unknown = TREE): string =>
  `\`\`\`json\n${JSON.stringify(tree, null, 2)}\n\`\`\`\n`
