// fixture: consistent-type-assertions should NOT fire
// casting a non-object-literal value with "as" is allowed
export function narrow(x: unknown): string {
  return x as string
}
