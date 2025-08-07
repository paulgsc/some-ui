import type { MoodEvent } from "@nfl/types/hopium-tracker"

// Baseline 100, discrete snapshots across 3 weeks (sample data).
// You can extend/replace with real season events.
const base = 100
const raw: Array<Omit<MoodEvent, "index" | "mood">> = [
  // Week 1
  {
    id: 1,
    week: 1,
    label: "Kickoff",
    description: "Season kickoff. Optimism is high.",
    team: "KC",
    category: "start",
    delta: +10,
  },
  {
    id: 2,
    week: 1,
    label: "Opening TD",
    description: "Chiefs punch it in on the opening drive.",
    team: "KC",
    category: "excitement",
    delta: +12,
  },
  {
    id: 3,
    week: 1,
    label: "Turnover",
    description: "Costly fumble flips momentum.",
    team: "KC",
    category: "stress",
    delta: -15,
  },
  {
    id: 4,
    week: 1,
    label: "W1 Final",
    description: "Week 1 wraps with a narrow W.",
    team: "KC",
    category: "result",
    delta: +8,
  },

  // Week 2
  {
    id: 5,
    week: 2,
    label: "Slow Start",
    description: "Offense sputters early.",
    team: "KC",
    category: "concern",
    delta: -10,
  },
  {
    id: 6,
    week: 2,
    label: "Kelce Magic",
    description: "Kelce sparks the crowd with a signature play.",
    team: "KC",
    category: "magic",
    delta: +14,
  },
  {
    id: 7,
    week: 2,
    label: "Goal-Line Stop",
    description: "Defense bends but does not break.",
    team: "KC",
    category: "defense",
    delta: +6,
  },
  {
    id: 8,
    week: 2,
    label: "W2 Final (L)",
    description: "Tough finish — week 2 ends in an L.",
    team: "KC",
    category: "result",
    delta: -18,
  },

  // Week 3
  {
    id: 9,
    week: 3,
    label: "Mahomes No-Look",
    description: "Mahomes delivers a no-look dime.",
    team: "KC",
    category: "style",
    delta: +16,
  },
  {
    id: 10,
    week: 3,
    label: "Red Zone Stalls",
    description: "Drives stall in the red zone.",
    team: "KC",
    category: "execution",
    delta: -12,
  },
  {
    id: 11,
    week: 3,
    label: "Clutch Drive",
    description: "Two-minute drill sets up the win.",
    team: "KC",
    category: "clutch",
    delta: +20,
  },
  {
    id: 12,
    week: 3,
    label: "W3 Final",
    description: "Statement win to close out week 3.",
    team: "KC",
    category: "result",
    delta: +10,
  },
]

export function buildMoodEvents(): Array<MoodEvent> {
  let mood = base
  return raw.map((e, i) => {
    mood += e.delta
    return { ...e, index: i, mood }
  })
}
