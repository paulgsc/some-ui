export class TextProcessor {
  static prepareTextForUtterance(
    text: string,
    maxLength: number,
    minLength: number
  ): string | null {
    if (!text || typeof text !== "string") return null

    const cleanText = text.trim()

    // Skip if too short for meaningful utterance
    if (cleanText.length < minLength) return null

    // If text is within reasonable length, return as-is
    if (cleanText.length <= maxLength) return cleanText

    // For long text, take the last portion (most recent typing)
    // Try to break at word boundary if possible
    let truncated = cleanText.slice(-maxLength)

    // Find the first space to avoid cutting words in half
    const firstSpace = truncated.indexOf(" ")
    if (firstSpace > 0 && firstSpace < 50) {
      truncated = truncated.slice(firstSpace + 1)
    }

    return truncated
  }
}
