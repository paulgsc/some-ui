/**
 * `1 session`, `3 sessions`: a count with its noun, plural past one; an
 * irregular plural is passed (`counted(n, "entry", "entries")`).
 */
export function counted(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`
}

/** "12.4 KB": a byte count as a person reads it. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** `audio/webm;codecs=opus` -> `webm`: a MIME type's subtype, for a file name. */
export function extensionOf(mimeType: string): string {
  return mimeType.split(/[/;]/)[1] ?? "bin"
}

export const getAcronymFromString = (str: string): string =>
  (str.trim().match(/\b(\w)/g) ?? [""]).join("").toUpperCase()
