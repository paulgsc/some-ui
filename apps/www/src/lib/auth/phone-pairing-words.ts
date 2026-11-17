/**
 * What the lan web's Settings › Account › Phones says beside a pairing code
 * (SIGNIN4, #3090): where the code goes on the phone, in the phone's own
 * page names, so a rename there fails this table's test instead of leaving
 * these words pointing at a page that is gone.
 */
import { concern } from "@/lib/front-desk"

/** The phone's Pair button, on its Home page. */
const PHONE_PAIR = "Pair"

export const PHONE_PAIRING = {
  heading: "Phones",
  lead: "A paired phone sends here only what you tap to send, or chose there to keep sending, and names this server first. To end a lost phone's sign-in, sign out everywhere.",
  pairAPhone: "Pair a phone",
  newCode: "Get a new code",
  codeFor: "Code for your phone",
  /** Where the code goes on the phone; the address follows it. */
  onThePhone: `On the phone: a new phone asks for this code when it first opens. Otherwise tap the mark at the top of the screen, or open Settings, then ${concern("home").title}, then ${PHONE_PAIR}. The address to type:`,
} as const

/** The phone's own words this table names, for its test. */
export const PHONE_NAMES = {
  page: concern("home").title,
  pair: PHONE_PAIR,
} as const
