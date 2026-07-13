// dateUtil.ts

/**
 * Formats a given date as a relative time string (e.g., "just now", "5 mins ago", "2 days ago").
 * @param date - The date to format.
 * @returns A human-readable relative time string.
 */
export function formatRelativeTime(date: Date | string | number): string {
  const now = new Date()
  const givenDate = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - givenDate.getTime()) / 1000)

  if (diffInSeconds < 0) {
    return "in the future"
  }

  const seconds = diffInSeconds
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const years = Math.floor(days / 365)

  if (seconds < 5) {
    return "just now"
  } else if (seconds < 60) {
    return `${seconds} seconds ago`
  } else if (minutes < 60) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`
  } else if (hours < 24) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`
  } else if (days <= 7) {
    return `${days} day${days > 1 ? "s" : ""} ago`
  } else if (weeks < 52) {
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`
  }
  return `${years} year${years > 1 ? "s" : ""} ago`
}
