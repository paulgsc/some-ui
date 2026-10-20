/** What the person must never be told in: how it works, not what it does. */
export const MACHINERY =
  /\b(grant|consent|scope|sync\w*|server|request|response|status|error|api|http\w*|https?:|\d{3}\b|token|queue|retry|null|undefined|lane|pull\w*|outbox)\b|\.(lan|local|com)\b/i
