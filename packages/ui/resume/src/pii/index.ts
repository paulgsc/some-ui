// The contact details (PII) a résumé build may take, the templates that
// render them, and the client for the LAN render service that builds with
// them. envelope.json is the one source: src/lib/pii.typ checks every build
// against it, scripts/serve.mjs offers its templates, and apps/www's
// /resume-build page labels and bounds its inputs from it.
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
