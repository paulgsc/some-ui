/**
 * Where a lead sits in the funnel. Deliberately small and linear — this is a
 * queue of active leads to work through, not a full CRM pipeline.
 */
export type JobStatus =
  | "saved"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"

export type JobEntry = {
  id: string
  company: string
  role: string
  url: string | null
  status: JobStatus
  notes: string | null
  /** ISO 8601 timestamp. Also the pruning key — see `oldestEntry`. */
  addedAt: string
}

export type NewJobInput = {
  company: string
  role: string
  url?: string | null
  status?: JobStatus
  notes?: string | null
}
