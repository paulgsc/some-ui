import type {
  EnqueueResult,
  JobEntry,
  JobStatus,
  NewJobInput,
} from "@some-ui/job-tracker"
import {
  enqueue,
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

export type { EnqueueResult, JobEntry, JobStatus, NewJobInput }

// Not exported: nothing outside this file reads the raw storage key.
// `MAX_QUEUE_SIZE` and `isFull` are consumed straight from
// `@some-ui/job-tracker` by the route (jobs.tsx) rather than re-exported
// through here, since they're pure and have nothing to do with storage.
const STORAGE_KEY = "some-ui.job-tracker.queue.v1"

/**
 * What the route is allowed to know about job-queue storage. Unlike
 * `SessionsStore` (lib/tenant/sessions-repository), this has no server
 * counterpart to keep parity with and no reason to simulate network
 * latency: it is local-only by design, so every method here is synchronous.
 * Not exported: nothing outside this file names the type directly (the
 * route consumes `createJobTrackerRepository`'s inferred return type), so
 * it stays a self-check on the class below via `implements`.
 */
type JobTrackerStore = {
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
