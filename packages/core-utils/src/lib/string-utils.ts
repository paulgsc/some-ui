/** "12.4 KB": a byte count as a person reads it. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const getAcronymFromString = (str: string): string =>
  (str.trim().match(/\b(\w)/g) ?? [""]).join("").toUpperCase()
