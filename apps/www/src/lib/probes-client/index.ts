/**
 * Home's probes, as the "Is it working?" page (CK8, #2388) reads and runs
 * them, over this app's `file_host` transport (`requestJSON`). CK4 (#2383).
 *
 * The routes are paulgsc/server's `routes::probes`, operator only (a passkey
 * session of the home's owner): `GET /probes` lists each probe with its newest
 * runs, and `POST /probes/transcription` starts a transcription run, or joins
 * the one already open. A run's result comes later, once home's transcriber
 * has heard the probe note, so the page reads it back from `list`.
 */

import type {
  FileHostTransport,
  RequestOptions,
} from "@/lib/file-host-config/client"
import {
  createFileHostTransport,
  requestJSON,
} from "@/lib/file-host-config/client"

/** How a run ended: `handlers::probes::ResultView` on the server. */
type ProbeResult = {
  verdict: "pass" | "fail"
  /** The transcript's outcome, or `timed_out` when none came in time. */
  outcome:
    | "heard"
    | "silent"
    | "unreadable"
    | "too_long"
    | "deadline"
    | "failed"
    | "timed_out"
  /** For `heard`: the word error rate against the clip's words, 0 and up. */
  wordError: number | null
  /** From the run's start to its ending: the time to transcript. */
  waitedMs: number
  tookMs: number | null
  model: string | null
  engine: string | null
  endedAt: string
}

/** A run, with its result once it has ended: `RunView`. */
type ProbeRun = {
  runId: string
  askedBy: "schedule" | "page"
  startedAt: string
  result: ProbeResult | null
}

/** One probe and its newest runs, newest first: `ProbeView`. */
export type Probe = {
  probe: "transcription"
  /** Whether home runs it: the transcription probe needs transcription on. */
  enabled: boolean
  everySeconds: number
  boundSeconds: number
  runs: Array<ProbeRun>
}

type ProbeAsked = {
  run: ProbeRun
  /** A run was already open: this is it, and nothing new started. */
  joined: boolean
}

type ProbesClient = {
  /** `GET /probes`. */
  list: () => Promise<Array<Probe>>
  /** `POST /probes/transcription`. */
  runTranscription: () => Promise<ProbeAsked>
}

/**
 * `transport` is a seam for tests; the default resolves `file_host` the way
 * every caller in this app does (`lib/file-host-config`). A build with no
 * `file_host` at all gets a client whose every call rejects, saying so.
 */
export function createProbesClient(
  transport: FileHostTransport | null = createFileHostTransport("account")
): ProbesClient {
  const request = <T>(
    route: string,
    init?: RequestInit,
    options?: RequestOptions
  ): Promise<T> =>
    transport
      ? requestJSON<T>(transport, route, init, options)
      : Promise.reject(new Error("This build has no file_host to talk to."))

  return {
    list: async () =>
      (await request<{ probes: Array<Probe> }>("/probes")).probes,
    // Asking again while a run is open joins it, so a timed-out ask may be
    // retried without starting a second run.
    runTranscription: () =>
      request<ProbeAsked>(
        "/probes/transcription",
        { method: "POST" },
        { idempotent: true }
      ),
  }
}
