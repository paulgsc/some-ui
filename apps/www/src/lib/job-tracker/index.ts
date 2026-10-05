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

// Not exported. `MAX_QUEUE_SIZE` and `isFull` come straight from
// `@some-ui/job-tracker`.
const STORAGE_KEY = "some-ui.job-tracker.queue.v1"

/**
 * What the route may know about job-queue storage: local-only, so every
 * method is synchronous. Unexported; a self-check on the class via
 * `implements`.
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
