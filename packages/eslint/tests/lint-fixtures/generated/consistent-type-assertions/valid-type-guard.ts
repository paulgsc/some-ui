// fixture: consistent-type-assertions should NOT fire
// Safe type guards are the design-approved alternative pattern to assertions
type User = { id: string }
export function isUser(x: unknown): x is User {
  return typeof x === "object" && x !== null && "id" in x
}
