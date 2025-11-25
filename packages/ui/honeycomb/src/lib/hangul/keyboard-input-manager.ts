import {
  ALL_MAPPINGS,
  HANGUL_TO_QWERTY,
} from "@honeycomb/utils/hangul-keyboard-mapping"

export type KeySequence = {
  key: string // Single key character
  timestamp: number
}

export type MatchResult = {
  matched: boolean
  hangul?: string
  keys?: string
  isPartialMatch: boolean // True if buffer is building toward a potential match
}

export class KeyboardInputManager {
  private keyBuffer: Array<KeySequence> = []
  private readonly bufferTimeoutMs: number = 300
  private lastProcessedTime: number = 0

  constructor(bufferTimeoutMs: number = 300) {
    this.bufferTimeoutMs = bufferTimeoutMs
  }

  /**
   * Add a single key press and attempt greedy matching against active characters
   *
   * @param key - The key that was pressed
   * @param timestamp - When the key was pressed
   * @param activeHangulChars - Set of hangul characters currently in the game
   * @returns MatchResult indicating if a match was found
   */
  addKey(
    key: string,
    timestamp: number,
    activeHangulChars: Set<string>
  ): MatchResult {
    // Clean old keys from buffer based on timeout
    this.keyBuffer = this.keyBuffer.filter(
      (seq) => timestamp - seq.timestamp < this.bufferTimeoutMs
    )

    // Add the new single key press
    this.keyBuffer.push({ key, timestamp })

    const currentSequence = this.getBufferString()

    // Try to find matches, prioritizing longer sequences (greedy)
    // Sort by length descending so "hk" is checked before "h"
    const sortedMappings = [...ALL_MAPPINGS].sort(
      (a, b) => b.qwerty.length - a.qwerty.length
    )

    for (const mapping of sortedMappings) {
      // Check if current buffer matches this mapping's key sequence
      if (currentSequence === mapping.qwerty) {
        // Check if this hangul character is actually in the game right now
        if (activeHangulChars.has(mapping.hangul)) {
          // MATCH FOUND! Clear buffer and return success
          this.clearBuffer()
          this.lastProcessedTime = timestamp
          return {
            matched: true,
            hangul: mapping.hangul,
            keys: mapping.qwerty,
            isPartialMatch: false,
          }
        }
      }
    }

    // No complete match found. Check if buffer is a valid partial sequence
    const isPartial = this.isValidPartialSequence(
      currentSequence,
      activeHangulChars
    )

    return {
      matched: false,
      isPartialMatch: isPartial,
    }
  }

  /**
   * Check if the current buffer could be building toward a valid match
   * with any of the active characters
   */
  private isValidPartialSequence(
    sequence: string,
    activeHangulChars: Set<string>
  ): boolean {
    // Check if any active character's key sequence starts with current buffer
    for (const hangul of activeHangulChars) {
      const expectedKeys = HANGUL_TO_QWERTY.get(hangul)
      if (
        expectedKeys &&
        expectedKeys.startsWith(sequence) &&
        expectedKeys !== sequence
      ) {
        return true // This is a valid prefix for a potential match
      }
    }
    return false
  }

  /**
   * Get current buffer as a concatenated string
   */
  private getBufferString(): string {
    return this.keyBuffer.map((seq) => seq.key).join("")
  }

  /**
   * Clear the key buffer
   */
  clearBuffer(): void {
    this.keyBuffer = []
  }

  /**
   * Get current buffer for debugging/display
   */
  getBuffer(): string {
    return this.getBufferString()
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
