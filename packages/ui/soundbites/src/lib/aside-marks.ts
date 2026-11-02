/**
 * What owes home a soundbite's set-aside mark (MIC2, www's LA13): Let go
 * owes it before the store writes the standing (`./runtime`), and takes it
 * back when that write fails. The phone's page hands www's in
 * (`soundbitesOweMarks`, from `lib/voice-marks`); until then, as in a
 * build with no home, nothing goes home under a mark, so owing answers yes.
 */

/** What owes home a note's set-aside mark, and takes one back. */
export type MarkOwing = {
  /** Owes `id`'s mark, let go at `at` (ISO 8601); says whether storage kept it. */
  readonly owe: (id: string, at: string) => boolean
  /** Takes back a mark owed for a set-aside write that did not happen. */
  readonly unowe: (id: string) => void
}

const NO_HOME: MarkOwing = { owe: () => true, unowe: () => undefined }

let owing: MarkOwing = NO_HOME

/** The phone's page hands in what owes home a soundbite's mark. */
export function soundbitesOweMarks(next: MarkOwing): void {
  owing = next
}

/** What owes marks now. */
export const asideMarks = (): MarkOwing => owing
