import { afterEach, describe, expect, it, vi } from "vitest"

import { createMockTranscriptionAdapter } from "./transcription-adapter"

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const META = {
  questionId: "q1",
  category: "technical" as const,
  durationSeconds: 45,
}

/**
 * The adapter's `submit` reads `Math.random()` once to decide willFail, then
 * again inside `randomBetween` for latency. Pinning min===max collapses
 * `randomBetween` to a constant regardless of its random draw, so mocking
 * only the first call is enough to make both branches deterministic.
 */
function mockNextRandom(value: number): void {
  vi.spyOn(Math, "random").mockImplementationOnce(() => value)
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════
// submit/poll lifecycle
// ═══════════════════════════════════════════════════════════════════════════

describe("createMockTranscriptionAdapter - submit/poll lifecycle", () => {
  it("reports 'processing' before readyAt and resolves to 'done' after, on the success path", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000)
    mockNextRandom(0.99) // >= default failureRate (0.08) -> success
    const adapter = createMockTranscriptionAdapter({
      minLatencyMs: 500,
      maxLatencyMs: 500,
    })

    const { jobId } = await adapter.submit(new Blob(), META)

    await expect(adapter.poll(jobId)).resolves.toEqual({
      status: "processing",
    })

    vi.spyOn(Date, "now").mockReturnValue(1_000_000 + 500)
    const result = await adapter.poll(jobId)
    expect(result.status).toBe("done")
    expect(result.transcript).toBeTruthy()
  })

  it("resolves to 'error' after readyAt on the failure path", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000)
    mockNextRandom(0.01) // < default failureRate (0.08) -> failure
    const adapter = createMockTranscriptionAdapter({
      minLatencyMs: 500,
      maxLatencyMs: 500,
    })

    const { jobId } = await adapter.submit(new Blob(), META)

    vi.spyOn(Date, "now").mockReturnValue(2_000_000 + 500)
    const result = await adapter.poll(jobId)
    expect(result).toEqual({
      status: "error",
      error: "Network error: failed to transcribe recording",
    })
  })

  it("reports an error for an unknown job id", async () => {
    const adapter = createMockTranscriptionAdapter()
    const result = await adapter.poll("nonexistent-job")
    expect(result).toEqual({
      status: "error",
      error: "Unknown transcription job",
    })
  })
})
