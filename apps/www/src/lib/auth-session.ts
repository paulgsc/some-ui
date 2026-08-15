/**
 * A deliberately in-memory auth stub. It exists only to demonstrate the
 * route workflow until the backend can provide a real session.
 */
let authenticated = false

export function hasDecorativeSession(): boolean {
  return authenticated
}

export function createDecorativeSession(): void {
  authenticated = true
}
