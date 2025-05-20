// Format date to relative time
export const formatDate = (date: Date): string => {
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)
  )

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return `${Math.floor(diffDays / 30)} months ago`
}
