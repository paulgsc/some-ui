export type JobApplicationStatus = {
  rejected: "Society Wins Again"
  interview: "Green Flagged"
  ghosted: "Crickets"
  applied: "Hopium"
  offer: "Is this real life"
  Scam: "Never began"
}

type LeetcodeFields = "Easy" | "Medium" | "Hard"

type JobStatusValues = JobApplicationStatus[keyof JobApplicationStatus]

type StatsFields = JobStatusValues | LeetcodeFields

export type GrindStats = {
  color: string
  value: number
  name: StatsFields
}
