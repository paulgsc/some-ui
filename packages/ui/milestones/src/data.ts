import type { Milestone } from "./types"

/**
 * Sample data, not a fixture the component is built around. It spans
 * unrelated domains on purpose — engineering is one milestone among many,
 * not the reason this package exists. A consumer replaces this array
 * entirely; nothing downstream reads these ids or copy.
 */
export const sampleMilestones: ReadonlyArray<Milestone> = [
  {
    id: "ci-green",
    tone: "joy",
    category: "Engineering",
    title: "Main is green. Actually, genuinely green.",
    reflection: "Finally got my main branch to be green check marked, woohoo.",
    timestamp: "Aug 2026",
    stats: [
      { label: "Red builds survived", value: "1,204" },
      { label: "Debt tickets closed", value: "318" },
    ],
  },
  {
    id: "first-10k",
    tone: "relief",
    category: "Health",
    title: "Ran the whole 10K without stopping",
    reflection: "Six months ago I couldn't do one mile without walking.",
    timestamp: "Jun 2026",
    stats: [
      { label: "Pace", value: "6:42/km" },
      { label: "Training weeks", value: "24" },
    ],
  },
  {
    id: "hard-conversation",
    tone: "grind",
    category: "Relationships",
    title: "Had the conversation I'd been avoiding for a year",
    reflection: "It went badly, and I'm still glad I said it.",
    timestamp: "Mar 2026",
  },
  {
    id: "missed-deadline",
    tone: "dread",
    category: "Craft",
    title: "Missed the deadline I promised myself",
    reflection: "Third rewrite of the same chapter. Still not right.",
    timestamp: "Jan 2026",
  },
]
