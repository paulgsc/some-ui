import type { Digest, Pick } from "@some-ui/job-desk"
import { fingerprint } from "@some-ui/job-desk"
import type { BlobShelf } from "@some-ui/voice-capture"
import { vi } from "vitest"

import type { JobsPorts } from "@/lib/jobs/runtime"
import { createInMemoryStorage } from "@/lib/tenant/storage"

function pick(id: string, company: string, adjacent: boolean): Pick {
  const posting = {
    title: adjacent ? "Data Analyst" : "Software Engineer",
    company,
    location: "Remote",
    compensation: null,
    experience: null,
    postedOn: "2026-10-15",
    applyUrl: `https://to.indeed.com/${id}`,
  }
  return {
    id,
    ...(adjacent
      ? { track: "adjacent", family: "data" }
      : { track: "software", family: null }),
    fingerprint: fingerprint(posting),
    posting,
    scores: { fit: 0.6, odds: 0.4, fitWhy: "covers 6 of 10", oddsWhy: "new" },
    wants: "Things.",
    fits: [{ title: "SQL", detail: "Dashboards.", source: "personal" }],
    gaps: [],
    dontClaim: [],
    resume: adjacent
      ? {
          kind: "patch",
          variant: "data",
          template: "safe",
          fallback: "backend",
          pr: null,
          change: "A data composition.",
        }
      : { kind: "build", variant: "backend", template: "safe", ref: "cb503cb" },
    kit: {
      fields: [],
      answers: [],
      coverLetter: null,
      questions: [],
      compensation: null,
    },
  }
}

/** When a test's digests are opened, before any event it records. */
export const OPENED_AT = "2026-10-17T15:00:00Z"

/** A digest for `day` with one software pick and one adjacent one. */
export function digest(day: string): Digest {
  return {
    schema: "some-ui.job-digest/1",
    day,
    createdAt: `${day}T14:52:00Z`,
    seen: 12,
    picks: [
      pick("nor-0b77", "Northwind Avionics", false),
      pick("tid-7f2a", "Tidewater Analytics", true),
    ],
    queue: null,
    redrafts: [],
    setAside: [
      {
        fingerprint: "juniper row|software engineer ii|remote",
        title: "Software Engineer II",
        company: "Juniper Row",
        why: "Stale",
      },
    ],
    scouts: [],
    read: [],
    transcribed: [],
    evidence: { someUi: "cb503cb", server: "9226240" },
  }
}

/** A shelf in memory. */
function memoryShelf(): BlobShelf & { blobs: Map<string, Blob> } {
  const blobs = new Map<string, Blob>()
  return {
    blobs,
    put: (id, blob): Promise<void> => {
      blobs.set(id, blob)
      return Promise.resolve()
    },
    get: (id) => Promise.resolve(blobs.get(id) ?? null),
    remove: (ids): Promise<void> => {
      for (const id of ids) blobs.delete(id)
      return Promise.resolve()
    },
    ids: () => Promise.resolve([...blobs.keys()]),
  }
}

/** A runtime's ports in memory, on 2026-10-18 unless `overrides` say not. */
export function ports(overrides: Partial<JobsPorts> = {}): JobsPorts {
  let n = 0
  return {
    storage: createInMemoryStorage(),
    audio: memoryShelf(),
    saving: () => undefined,
    isSaving: () => false,
    startRecording: vi.fn(),
    share: vi.fn(() => Promise.resolve<"shared" | "cancelled">("shared")),
    now: () => new Date("2026-10-18T22:00:00Z"),
    dayOf: () => "2026-10-18",
    newId: () => `id${(n += 1)}`,
    ...overrides,
  }
}
