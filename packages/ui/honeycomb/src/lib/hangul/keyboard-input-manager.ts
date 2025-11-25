import {
  ALL_MAPPINGS,
  HANGUL_TO_QWERTY,
} from "@honeycomb/utils/hangul-keyboard-mapping"

export type KeySequence = {
  keys: string
  timestamp: number
}

export class KeyboardInputManager {
  private keyBuffer: Array<KeySequence> = []
  private readonly bufferTimeoutMs: number = 300 // Time window for compound keys
  private lastProcessedTime: number = 0

  constructor(bufferTimeoutMs: number = 300) {
    this.bufferTimeoutMs = bufferTimeoutMs
  }

  /**
   * Add a key to the buffer and check for matches
   * Returns the matched hangul character if found, or null
   */
  addKey(
    key: string,
    timestamp: number
  ): { hangul: string; keys: string } | null {
    // Clean old keys from buffer
    this.keyBuffer = this.keyBuffer.filter(
      (seq) => timestamp - seq.timestamp < this.bufferTimeoutMs
    )

    // Add new key
    this.keyBuffer.push({ keys: key, timestamp })

    // Try to match compound keys first (longer sequences)
    // Sort mappings by key length (longest first) to match compounds first
    const sortedMappings = [...ALL_MAPPINGS].sort(
      (a, b) => b.qwerty.length - a.qwerty.length
    )

    for (const mapping of sortedMappings) {
      const keySequence = this.getKeySequence(mapping.qwerty.length)
      if (keySequence === mapping.qwerty) {
        // Match found! Clear buffer and return
        this.clearBuffer()
        this.lastProcessedTime = timestamp
        return {
          hangul: mapping.hangul,
          keys: mapping.qwerty,
        }
      }
    }

    // No match yet - either waiting for more keys or invalid sequence
    return null
  }

  /**
   * Get the last N keys as a string
   */
  private getKeySequence(length: number): string {
    if (this.keyBuffer.length < length) return ""

    return this.keyBuffer
      .slice(-length)
      .map((seq) => seq.keys)
      .join("")
  }

  /**
   * Clear the key buffer (after successful match or timeout)
   */
  clearBuffer(): void {
    this.keyBuffer = []
  }

  /**
   * Get current buffer for debugging
   */
  getBuffer(): string {
    return this.keyBuffer.map((seq) => seq.keys).join("")
  }

  /**
   * Check if buffer should be cleared due to timeout
   */
  shouldClearBuffer(currentTime: number): boolean {
    if (this.keyBuffer.length === 0) return false
    const oldestKey = this.keyBuffer[0]
    return currentTime - oldestKey.timestamp > this.bufferTimeoutMs
  }

  /**
   * Reset the input manager
   */
  reset(): void {
    this.keyBuffer = []
    this.lastProcessedTime = 0
  }
}

/**
 * Check if a hangul character requires multiple keys
 */
export function isCompoundHangul(hangul: string): boolean {
  const qwertyKey = HANGUL_TO_QWERTY.get(hangul)
  return qwertyKey ? qwertyKey.length > 1 : false
}

/**
 * Get the expected key sequence for a hangul character
 */
export function getExpectedKeys(hangul: string): string {
  return HANGUL_TO_QWERTY.get(hangul) || ""
}
