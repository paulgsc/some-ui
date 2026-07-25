/**
 * Serialized mutation queue for preventing race conditions
 */
export class MutationQueue {
  private queue: Promise<void> = Promise.resolve()
  private pendingCount = 0

  /**
   * Enqueue a mutation to run serially
   */
  enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
    this.pendingCount++

    const mutation = this.queue.then(async () => {
      try {
        return await fn()
      } finally {
        this.pendingCount--
      }
    })

    // Update queue to wait for this mutation
    this.queue = mutation.then(
      () => {},
      () => {}
    ) // Swallow errors in queue chain

    return mutation
  }

  /**
   * Wait for all pending mutations to complete
   */
  async flush(): Promise<void> {
    await this.queue
  }

  get isPending(): boolean {
    return this.pendingCount > 0
  }

  get pendingMutations(): number {
    return this.pendingCount
  }

  /**
   * Clear the queue (doesn't cancel in-flight mutations)
   */
  clear(): void {
    this.queue = Promise.resolve()
  }
}
