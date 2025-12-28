export class TextProcessor {
  /**
   * Prepares text for TTS utterance with smart sentence-aware truncation
   * Phase 1: Lazy but solid - avoids nonsense output with minimal effort
   */
  static prepareTextForUtterance(
    text: string,
    maxWords: number = 100,
    minWords: number = 2
  ): string | null {
    if (!text || typeof text !== "string") return null

    const cleanText = text.trim()

    // Skip if no alphanumeric content (avoid TTS garbage)
    if (!/[a-zA-Z0-9]/.test(cleanText)) return null

    const words = cleanText.split(/\s+/)

    // Skip if too few words for meaningful utterance
    if (words.length < minWords) return null

    // If text is within reasonable word count, return as-is
    if (words.length <= maxWords) return cleanText

    // Smart truncation: try to end at sentence boundary
    return this.truncateTextSmart(cleanText, maxWords)
  }

  /**
   * Smart truncation that respects sentence boundaries
   * Prioritizes complete sentences over word limits
   */
  private static truncateTextSmart(text: string, maxWords: number): string {
    const words = text.split(/\s+/)

    // If we're close to the limit, just take it all
    if (words.length <= maxWords + 5) return text

    // Try to find the last complete sentence within our word limit
    const truncatedWords = words.slice(0, maxWords)
    const truncatedText = truncatedWords.join(" ")

    // Look for sentence endings (. ! ?) working backwards
    const sentenceEnders = /[.!?]/g
    let lastSentenceEnd = -1
    let match

    while ((match = sentenceEnders.exec(truncatedText)) !== null) {
      lastSentenceEnd = match.index
    }

    // If we found a sentence boundary and it's not too early, use it
    if (lastSentenceEnd > -1) {
      const sentenceText = truncatedText.slice(0, lastSentenceEnd + 1).trim()
      const sentenceWordCount = sentenceText.split(/\s+/).length

      // Only use sentence boundary if it's at least 50% of our target
      if (sentenceWordCount >= maxWords * 0.5) {
        return sentenceText
      }
    }

    // Fallback: truncate at word boundary (natural behavior now)
    return truncatedWords.join(" ").trim() + "..."
  }

  /**
   * Phase 2 preparation: Break text into sentence chunks for streaming
   * Call this when you're ready to implement queued TTS
   */
  static breakIntoSentences(
    text: string,
    maxWordsPerSentence: number = 15
  ): Array<string> {
    if (!text || typeof text !== "string") return []

    // Simple sentence splitting (can be enhanced later with NLP)
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /[a-zA-Z0-9]/.test(s))

    // Split overly long sentences at word boundaries
    const result: Array<string> = []
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/)
      if (words.length <= maxWordsPerSentence) {
        result.push(sentence)
      } else {
        // Break long sentences into chunks
        for (let i = 0; i < words.length; i += maxWordsPerSentence) {
          const chunk = words.slice(i, i + maxWordsPerSentence).join(" ")
          result.push(chunk)
        }
      }
    }

    return result
  }

  /**
   * Utility: Check if text is worth speaking (has meaningful content)
   */
  static isWorthSpeaking(text: string, minWords: number = 2): boolean {
    if (!text || typeof text !== "string") return false

    const cleanText = text.trim()
    if (cleanText.length < 1) return false

    // Must have alphanumeric content
    if (!/[a-zA-Z0-9]/.test(cleanText)) return false

    // Should have minimum word count
    const wordCount = cleanText
      .split(/\s+/)
      .filter((word) => word.length > 0).length
    return wordCount >= minWords
  }
}
