import type { Question } from "@chat/lib/interview/core/interview-types"

export const interviewQuestions: Array<Question> = [
  {
    id: "system-design-1",
    level: "mid",
    category: "system-design",
    question:
      "Design a URL shortening service like bit.ly. Consider scalability, database design, and API endpoints.",
    durationSeconds: 120,
  },
  {
    id: "behavioral-1",
    level: "mid",
    category: "behavioral",
    question:
      "Tell me about a time when you had to resolve a conflict within your team. How did you approach it?",
    durationSeconds: 90,
  },
  {
    id: "technical-1",
    level: "senior",
    category: "technical",
    question:
      "Explain how you would optimize a slow database query. What tools and techniques would you use?",
    durationSeconds: 100,
  },
  {
    id: "behavioral-2",
    level: "junior",
    category: "behavioral",
    question:
      "Describe a project you're proud of. What was your role, and what would you do differently now?",
    durationSeconds: 90,
  },
  {
    id: "system-design-2",
    level: "senior",
    category: "system-design",
    question:
      "Walk me through how you'd design a rate limiter that works across a fleet of API servers.",
    durationSeconds: 120,
  },
  {
    id: "leadership-1",
    level: "senior",
    category: "leadership",
    question:
      "How do you communicate a change in priorities to a team that's already deep into the old plan?",
    durationSeconds: 90,
  },
  {
    id: "technical-2",
    level: "mid",
    category: "technical",
    question:
      "What's the difference between optimistic and pessimistic concurrency control, and when would you reach for each?",
    durationSeconds: 100,
  },
  {
    id: "behavioral-3",
    level: "senior",
    category: "behavioral",
    question:
      "Tell me about a time you disagreed with a decision your manager made. What did you do?",
    durationSeconds: 90,
  },
]
