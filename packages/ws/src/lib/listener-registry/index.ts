/**
 * Type-safe listener registry with automatic cleanup
 */
export class ListenerRegistry<T> {
  private listeners = new Set<(data: T) => void>()

  add(listener: (data: T) => void): void {
    this.listeners.add(listener)
  }

  remove(listener: (data: T) => void): void {
    this.listeners.delete(listener)
  }

  notify(data: T): void {
    this.listeners.forEach((listener) => {
      try {
        listener(data)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Listener error:", err)
      }
    })
  }

  get size(): number {
    return this.listeners.size
  }

  clear(): void {
    this.listeners.clear()
  }

  isEmpty(): boolean {
    return this.listeners.size === 0
  }
}
