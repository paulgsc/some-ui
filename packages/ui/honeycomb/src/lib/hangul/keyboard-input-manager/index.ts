// Simplified manager - just handles local display buffer
// All matching logic is in Rust WASM core

export type KeySequence = {
  key: string
  timestamp: number
}

export class KeyboardInputManager {
  private keyBuffer: Array<KeySequence> = []
  private readonly bufferTimeoutMs: number = 300

  constructor(bufferTimeoutMs: number = 300) {
    this.bufferTimeoutMs = bufferTimeoutMs
  }

  /**
   * Add a key to the local display buffer
   * This is just for UI display - matching happens in Rust
   */
  addKey(key: string, timestamp: number): void {
    // Clean old keys from buffer based on timeout
    this.keyBuffer = this.keyBuffer.filter(
      (seq) => timestamp - seq.timestamp < this.bufferTimeoutMs
    )

    // Add the new single key press
    this.keyBuffer.push({ key, timestamp })
  }

  /**
   * Clear the key buffer
   */
  clearBuffer(): void {
    this.keyBuffer = []
  }

  /**
   * Drop the most recent key (ADR 0003 §2(b) backspace) - a no-op on an
   * already-empty buffer.
   */
  removeLastKey(): void {
    this.keyBuffer.pop()
  }

  /**
   * Get current buffer as string for display
   */
  getBuffer(): string {
    return this.keyBuffer.map((seq) => seq.key).join("")
  }

  /**
   * Check if buffer should be cleared due to timeout
   */
  shouldClearBuffer(currentTime: number): boolean {
    if (this.keyBuffer.length === 0) return false

    const oldestKey = this.keyBuffer[0]
    if (!oldestKey) return false
    return currentTime - oldestKey.timestamp > this.bufferTimeoutMs
  }

  /**
   * Reset the input manager
   */
  reset(): void {
    this.keyBuffer = []
  }
}
