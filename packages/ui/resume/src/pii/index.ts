// The contact details (PII) a résumé build may take and the templates that
// render them (envelope.json, enforced by src/lib/pii.typ), and the client
// for the LAN render service that builds with them.
import envelope from "./envelope.json"

// Spelled out rather than derived from the JSON, so the emitted declarations
// stand alone (dist carries no envelope.json). The assignment below fails to
// typecheck if the JSON loses a field or changes a rule's shape.
/** In the order the form offers them. */
export const PII_FIELD_NAMES = [
  "phone",
  "email",
  "linkedin",
  "address",
] as const
export type PiiField = (typeof PII_FIELD_NAMES)[number]
export type PiiRule = {
  readonly label: string
  readonly maxLength: number
  /** For src/lib/pii.typ, which is what enforces it. */
  readonly pattern: string
  readonly example: string
}
export type Pii = Partial<Record<PiiField, string>>

export const PII_FIELDS: Readonly<Record<PiiField, PiiRule>> = envelope.fields
export const PII_TEMPLATES: ReadonlyArray<string> = envelope.templates

export * from "./render-client"
