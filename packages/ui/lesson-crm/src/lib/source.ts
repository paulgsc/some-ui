/**
 * The lesson as a file, however it arrived.
 *
 * A pasted reply is tens of kilobytes of JSON nobody reads by eye - the
 * preview is how the operator sees a lesson - so the CRM never shows it as
 * text. Pasted, dropped, uploaded or read back from the server, it is held as
 * a `File` with its text beside it: the pane shows the file, the draft reads
 * the text.
 */

export type SourceOrigin = "pasted" | "uploaded" | "stored"

export type LessonSource = {
  file: File
  text: string
  origin: SourceOrigin
}

const NAMES: Record<Exclude<SourceOrigin, "uploaded">, string> = {
  pasted: "pasted-reply.md",
  stored: "lesson.json",
}

/** Text that arrived as text, elevated to a file. */
export function sourceFromText(
  text: string,
  origin: Exclude<SourceOrigin, "uploaded">,
  name: string = NAMES[origin]
): LessonSource {
  const type = name.endsWith(".json") ? "application/json" : "text/plain"
  return { file: new File([text], name, { type }), text, origin }
}

/** A file that arrived as a file. */
export async function sourceFromFile(file: File): Promise<LessonSource> {
  return { file, text: await file.text(), origin: "uploaded" }
}

/** "12.4 KB" - the one size a person needs to recognise their paste. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
