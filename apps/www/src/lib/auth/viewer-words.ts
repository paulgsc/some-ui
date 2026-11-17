/**
 * What `/auth` says on the viewer build (SIGNIN5, #3091): that only the
 * owner signs in, and where; that this is sample data and nothing is kept;
 * and one way on, into the demo. No passkey and no sign-in to press, since
 * a viewer has none to use. Held by `__tests__/viewer-words.test.ts`.
 */
export const VIEWER_AUTH = {
  title: "Only I sign in here",
  body: "Only I sign in, on my home network, where my own data stays. You're viewing my toolkit on sample data: try anything, nothing is kept.",
  open: "Open the demo",
} as const
