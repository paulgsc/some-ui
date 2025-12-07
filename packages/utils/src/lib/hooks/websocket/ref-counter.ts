/**
 * Thread-safe reference counter for managing WebSocket lifecycle
 */
export class ReferenceCounter {
  private count = 0
  private readonly onZero?: () => void

  constructor(options?: { onZero?: () => void }) {
    this.onZero = options?.onZero
  }

  acquire(): number {
    this.count++
    return this.count
  }

  release(): number {
    if (this.count <= 0) {
      throw new Error("ReferenceCounter: Cannot release, count is already 0")
    }

    this.count--

    if (this.count === 0 && this.onZero) {
      this.onZero()
    }

    return this.count
  }

  get current(): number {
    return this.count
  }

  get hasReferences(): boolean {
    return this.count > 0
  }

  reset(): void {
    this.count = 0
  }
}
