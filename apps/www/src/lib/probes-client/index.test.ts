import { afterEach, describe, expect, it, vi } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import type { Probe } from "@/lib/probes-client"
import { createProbesClient } from "@/lib/probes-client"

const run = {
  runId: "probe-0123456789abcdef0123456789abcdef",
  askedBy: "page" as const,
  startedAt: "2026-11-01T03:00:00.000Z",
  result: null,
}

const probe: Probe = {
  probe: "transcription",
  enabled: true,
  everySeconds: 86_400,
  boundSeconds: 3_600,
  runs: [
    run,
    {
      ...run,
      runId: "probe-ffffffffffffffffffffffffffffffff",
      askedBy: "schedule",
      result: {
        verdict: "pass",
        outcome: "heard",
        wordError: 0,
        waitedMs: 61_000,
        tookMs: 900,
        model: "ggml-small-q5_1.bin",
        engine: "whisper.cpp 1.8.3",
        endedAt: "2026-11-01T03:01:01.000Z",
      },
    },
  ],
}

function recording(body: unknown): {
  transport: FileHostTransport
  calls: Array<[string, string]>
} {
  const calls: Array<[string, string]> = []
  const transport: FileHostTransport = (route, init) => {
    calls.push([init?.method ?? "GET", route])
    return Promise.resolve(Response.json(body))
  }
  return { transport, calls }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("createProbesClient", () => {
  it("unwraps the listing from the server's probes route", async () => {
    const listed = recording({ probes: [probe] })
    expect(await createProbesClient(listed.transport).list()).toEqual([probe])
    expect(listed.calls).toEqual([["GET", "/probes"]])
  })

  it("asks for a transcription run with a POST, and says whether it joined one", async () => {
    const asked = recording({ run, joined: true })
    expect(
      await createProbesClient(asked.transport).runTranscription()
    ).toEqual({ run, joined: true })
    expect(asked.calls).toEqual([["POST", "/probes/transcription"]])
  })

  it("offers a retry after a timed-out ask: asking again joins the open run", async () => {
    vi.stubEnv("VITE_FILE_HOST_TIMEOUT_MS", "30")
    const hanging: FileHostTransport = () => new Promise<Response>(() => {})
    await expect(
      createProbesClient(hanging).runTranscription()
    ).rejects.toMatchObject({ retryable: true })
  })

  it("rejects, saying why, in a build with no file_host", async () => {
    await expect(createProbesClient(null).list()).rejects.toThrow(
      /no file_host/
    )
  })
})
