export type Tone = "joy" | "relief" | "grind" | "dread" | "rage"

export type Milestone = {
  tone: Tone
  badge: string
  title: string
  quote: string
  meta: string
  stats: ReadonlyArray<{ label: string; value: string }>
}

export const milestones: ReadonlyArray<Milestone> = [
  {
    tone: "joy",
    badge: "CI · main",
    title: "Main is green. Genuinely green.",
    quote: "finally got my main branch green check marked, woohoo",
    meta: "after 731 days of tech debt",
    stats: [
      { label: "red builds", value: "1,204" },
      { label: "tickets", value: "318" },
      { label: "pipeline", value: "4m 12s" },
    ],
  },
  {
    tone: "relief",
    badge: "incident · resolved",
    title: "The pager went quiet at 04:12",
    quote: "no alerts for six hours. I'm scared to breathe near the dashboard.",
    meta: "root cause: a semicolon and hubris",
    stats: [
      { label: "downtime", value: "38m" },
      { label: "coffees", value: "∞" },
      { label: "blame", value: "0" },
    ],
  },
  {
    tone: "grind",
    badge: "migration · 68%",
    title: "Two thousand files rewritten",
    quote: "the codemod handled 40%. I am the codemod for the other 60%.",
    meta: "quarter three of a two-week project",
    stats: [
      { label: "files", value: "2,041" },
      { label: "PRs", value: "96" },
      { label: "sanity", value: "low" },
    ],
  },
  {
    tone: "dread",
    badge: "legacy · untouched",
    title: "Opened billing_v2_final_FINAL.js",
    quote: "last commit: ‘do not touch, I do not know why this works’",
    meta: "author left the company in 2019",
    stats: [
      { label: "lines", value: "6,318" },
      { label: "tests", value: "0" },
      { label: "comments", value: "1" },
    ],
  },
]

export const timeline = [
  {
    tone: "dread" as const,
    when: "2024 · Q1",
    text: "Inherited the monolith. Build takes 41 minutes.",
  },
  {
    tone: "rage" as const,
    when: "2024 · Q3",
    text: "First upgrade attempt. Reverted in 90 minutes.",
  },
  {
    tone: "grind" as const,
    when: "2025 · all of it",
    text: "Strangler pattern, one module a week, no applause.",
  },
  {
    tone: "joy" as const,
    when: "2026 · Aug",
    text: "Green check on main. Screenshot framed.",
  },
] as const

export const faceOrder = [0, 3, 2, 1] as const
