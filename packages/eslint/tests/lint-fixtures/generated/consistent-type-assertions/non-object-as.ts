// fixture: consistent-type-assertions should FIRE
// assertionStyle: "never" bans non-object inline assertions as well
export function narrow(x: unknown): string { return x as string }
