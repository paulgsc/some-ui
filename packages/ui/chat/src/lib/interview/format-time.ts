export const formatTime = (totalSeconds: number): string => {
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}
