// fixture: consistent-type-assertions should FIRE
// assertionStyle: "never" bans angle-bracket cast wrappers
type Foo = { x: number }
const raw: unknown = {}
export const foo = <Foo>raw
