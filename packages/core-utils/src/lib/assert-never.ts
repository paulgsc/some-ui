/**
 * The default case of an exhaustive switch.
 *
 * Typing the parameter `never` is what makes this a *compile-time* check: if
 * a new member is added to the union being switched on and no case handles
 * it, the call stops type-checking. The throw is the second line of defence,
 * for a value that reached here despite the types - a payload from a socket,
 * a record written by an older version.
 *
 * Only reach for it where the union really is closed. A Redux-style reducer
 * that receives foreign actions must return its state instead; this one is
 * for unions this repo owns end to end, including Zod discriminated unions
 * that were validated at the boundary before they got here.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}
