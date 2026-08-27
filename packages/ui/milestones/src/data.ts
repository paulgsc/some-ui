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
    period: "previously",
    tone: "joy",
    category: "Engineering",
    title: "Got main to finally be green",
    reflection: "The main branch is finally green check marked. Woohoo.",
    timestamp: "Aug 2026",
    stats: [
      { label: "Red builds survived", value: "1,204" },
      { label: "Debt tickets closed", value: "318" },
    ],
  },
  {
    id: "mozilla-addon",
    period: "currently",
    tone: "joy",
    category: "Shipping",
    title: "My Mozilla add-on was approved",
    reflection:
      "Just got my Mozilla add-on approved by the Mozilla add-on team.",
    timestamp: "Aug 2026",
    stats: [
      { label: "Review status", value: "Approved" },
      { label: "Browsers", value: "Firefox" },
    ],
  },
  {
    id: "niners-australia",
    period: "upcoming",
    tone: "grind",
    category: "Adventure",
    title: "Witness a Niners game in Australia",
    reflection:
      "One for the itinerary: see the Niners play on the other side of the world.",
    timestamp: "Someday",
  },
]
