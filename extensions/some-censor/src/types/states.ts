/**
 * What the extract layer reads off a card for presentation. Zero runtime —
 * imported as `import type` everywhere. The view a card is in lives in
 * `lib/content/fsm.ts`.
 */

/**
 * What a card may present about itself. Deliberately no date: the raw upload
 * string is evidence (`core/observation.ts`), never something a veil or plate
 * may render (QD4, #1384).
 */
export type MetaData = {
  readonly channelName: string | null
  readonly duration: string | null
}
