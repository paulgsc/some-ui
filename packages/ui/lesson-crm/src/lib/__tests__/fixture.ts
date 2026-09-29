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
    probes: [
      {
        id: "p1",
        kind: "pick-valid",
        order: 3,
        anchorMessageId: "m1",
        prompt: "Which reply fits?",
        options: [
          {
            text: "커피 한 잔 주세요.",
            relation: "reply",
            valid: true,
            why: "Answers the question with a polite request.",
          },
          {
            text: "어서 오세요.",
            relation: "reply",
            valid: false,
            why: "That is the shop's welcome, not a customer's order.",
          },
        ],
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
    tags: ["topik-1", "cafe", "relation:invented"],
  }),
  "```",
].join("\n")
