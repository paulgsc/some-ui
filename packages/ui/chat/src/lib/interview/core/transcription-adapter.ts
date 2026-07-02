import {
  TranscriptionJobSchema,
  TranscriptionResultSchema,
  type QuestionCategory,
  type TranscriptionAdapter,
  type TranscriptionJob,
  type TranscriptionResult,
} from "@chat/lib/interview/core/interview-types"

const SAMPLE_TRANSCRIPTS: Record<QuestionCategory, string> = {
  "system-design":
    "I'd start by clarifying the read/write ratio and scale targets, then sketch the API surface before touching storage. For the data layer I'd lean on a key-value store for the hot path with a relational store for anything that needs joins, and put a cache in front of the reads. I'd call out the tradeoffs as I go rather than presenting one true answer.",
  behavioral:
    "There was a stretch where two teammates disagreed on the approach and it was starting to slow the team down. I pulled them into a short session, had each one state the other's position back to make sure we were arguing about the same thing, and we landed on a compromise neither had proposed on their own. The main thing I learned was to separate the disagreement from the people having it.",
  technical:
    "First I'd look at the query plan to see where time is actually going instead of guessing. Usually it's a missing index, a query pulling more columns than it needs, or an N+1 pattern hiding upstream. I'd fix the cheapest thing first, measure again, and only reach for caching once the query itself is as lean as it can be.",
  leadership:
    "I try to set the destination clearly and then get out of the way on the how. When priorities shift I explain the why before the what, because people execute better on things they understand rather than things they're just told. I also make a point of surfacing disagreement early so it doesn't calcify into resentment later.",
}

const randomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min

let mockJobCounter = 0

type MockTranscriptionAdapterOptions = {
  failureRate?: number
  minLatencyMs?: number
  maxLatencyMs?: number
}

/**
 * In-memory adapter used until the transcription backend exists. Simulates
 * an upload + async processing job so the UI can be built against real
 * pending/processing/done/error states instead of a single setTimeout.
 */
export const createMockTranscriptionAdapter = (
  options: MockTranscriptionAdapterOptions = {}
): TranscriptionAdapter => {
  const { failureRate = 0.08, minLatencyMs = 900, maxLatencyMs = 2200 } =
    options

  const jobs = new Map<
    string,
    { readyAt: number; result: TranscriptionResult; category: QuestionCategory }
  >()

  return {
    submit(_blob, meta): Promise<TranscriptionJob> {
      mockJobCounter += 1
      const jobId = `mock-job-${mockJobCounter}`

      const willFail = Math.random() < failureRate
      const readyAt = Date.now() + randomBetween(minLatencyMs, maxLatencyMs)

      jobs.set(jobId, {
        readyAt,
        category: meta.category,
        result: willFail
          ? { status: "error", error: "Network error: failed to transcribe recording" }
          : { status: "done", transcript: SAMPLE_TRANSCRIPTS[meta.category] },
      })

      return Promise.resolve({ jobId })
    },

    poll(jobId): Promise<TranscriptionResult> {
      const job = jobs.get(jobId)
      if (!job) {
        return Promise.resolve({ status: "error", error: "Unknown transcription job" })
      }
      if (Date.now() < job.readyAt) {
        return Promise.resolve({ status: "processing" })
      }
      return Promise.resolve(job.result)
    },
  }
}

type HttpTranscriptionAdapterOptions = {
  baseUrl: string
  headers?: Record<string, string>
}

/**
 * Real backend seam. POSTs the recording, then polls a status endpoint
 * until the job resolves. Not wired up by default - swap
 * `createMockTranscriptionAdapter()` for `createHttpTranscriptionAdapter(...)`
 * once the transcription service exists.
 */
export const createHttpTranscriptionAdapter = (
  options: HttpTranscriptionAdapterOptions
): TranscriptionAdapter => {
  const { baseUrl, headers = {} } = options

  return {
    async submit(blob, meta): Promise<TranscriptionJob> {
      const formData = new FormData()
      formData.append("audio", blob)
      formData.append("questionId", meta.questionId)
      formData.append("durationSeconds", String(meta.durationSeconds))

      const response = await fetch(`${baseUrl}/recordings`, {
        method: "POST",
        headers,
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Failed to submit recording: ${response.status}`)
      }

      return TranscriptionJobSchema.parse(await response.json())
    },

    async poll(jobId): Promise<TranscriptionResult> {
      const response = await fetch(`${baseUrl}/recordings/${jobId}`, {
        headers,
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch transcription status: ${response.status}`)
      }

      return TranscriptionResultSchema.parse(await response.json())
    },
  }
}
