import type {
  EnqueueResult,
  JobEntry,
  JobStatus,
  NewJobInput,
} from "@some-ui/job-tracker"
import {
  enqueue,
  MAX_QUEUE_SIZE,
  oldestEntry,
  removeEntry,
  updateEntryStatus,
} from "@some-ui/job-tracker"

import type { StorageAdapter } from "@/lib/tenant/storage"
import {
  browserLocalStorage,
  generateId,
  readJSON,
  writeJSON,
} from "@/lib/tenant/storage"

/** Also read by tests via an in-memory `StorageAdapter`. */
export const STORAGE_KEY = "some-ui.job-tracker.queue.v1"

export { MAX_QUEUE_SIZE }
export type { EnqueueResult, JobEntry, JobStatus, NewJobInput }

/**
 * What the route is allowed to know about job-queue storage. Unlike
 * `SessionsStore` (lib/tenant/sessions-repository), this has no server
 * counterpart to keep parity with and no reason to simulate network
 * latency: it is local-only by design, so every method here is synchronous.
 */
export type JobTrackerStore = {
  list: () => ReadonlyArray<JobEntry>
  add: (input: NewJobInput) => EnqueueResult
  remove: (id: string) => void
  updateStatus: (id: string, status: JobStatus) => void
  oldest: () => JobEntry | null
}

export class JobTrackerRepository implements JobTrackerStore {
  constructor(private readonly storage: StorageAdapter) {}

  private readAll(): ReadonlyArray<JobEntry> {
    return readJSON(this.storage, STORAGE_KEY, [])
  }

  private writeAll(queue: ReadonlyArray<JobEntry>): void {
    writeJSON(this.storage, STORAGE_KEY, queue)
  }

  list(): ReadonlyArray<JobEntry> {
    return this.readAll()
  }

  add(input: NewJobInput): EnqueueResult {
    const result = enqueue(
      this.readAll(),
      input,
      generateId("job"),
      new Date().toISOString()
    )
    if (result.ok) this.writeAll(result.queue)
    return result
  }

  remove(id: string): void {
    this.writeAll(removeEntry(this.readAll(), id))
  }

  updateStatus(id: string, status: JobStatus): void {
    this.writeAll(updateEntryStatus(this.readAll(), id, status))
  }

  oldest(): JobEntry | null {
    return oldestEntry(this.readAll())
  }
}

export function createJobTrackerRepository(
  storage: StorageAdapter = browserLocalStorage
): JobTrackerRepository {
  return new JobTrackerRepository(storage)
}
