export function getFallbackImageUrl(): string {
  return "/placeholder.svg?height=64&width=64"
}

export function shouldTextScroll(text: string, maxLength: number): boolean {
  return text.length > maxLength
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.substring(0, maxLength - 3)}...`
}
