// The local display buffer only; all matching happens in the Rust WASM core.

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

  addKey(key: string, timestamp: number): void {
    this.keyBuffer = this.keyBuffer.filter(
      (seq) => timestamp - seq.timestamp < this.bufferTimeoutMs
    )

    this.keyBuffer.push({ key, timestamp })
  }

  clearBuffer(): void {
    this.keyBuffer = []
  }

  /** Drops the most recent key (ADR 0003 §2(b) backspace). */
  removeLastKey(): void {
    this.keyBuffer.pop()
  }

  getBuffer(): string {
    return this.keyBuffer.map((seq) => seq.key).join("")
  }

  shouldClearBuffer(currentTime: number): boolean {
    if (this.keyBuffer.length === 0) return false

    const oldestKey = this.keyBuffer[0]
    if (!oldestKey) return false
    return currentTime - oldestKey.timestamp > this.bufferTimeoutMs
  }

  reset(): void {
    this.keyBuffer = []
  }
}
