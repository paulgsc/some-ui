// fixture: consistent-type-assertions should FIRE
// assertionStyle: "never" bans casting object literals completely
type Foo = { x: number }
export const foo = {} as Foo
