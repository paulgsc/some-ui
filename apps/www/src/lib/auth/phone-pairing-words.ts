/**
 * What the lan web's Settings › Account › Phones says beside a pairing code
 * (SIGNIN4, #3090): where the code goes on the phone, in the phone's own
 * names: its Home page's title, read from `lib/front-desk`, and its Pair
 * button's, which this table's test holds against the phone's own words, so
 * a rename there fails it instead of leaving these words pointing at a page
 * or button that is gone.
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
  onThePhone: `On the phone: a new phone opened from the app's main icon asks for this code. Otherwise tap the mark at the top of the screen, or open Settings, then ${concern("home").title}, then ${PHONE_PAIR}. The address to type:`,
} as const

/** The phone's own words this table names, for its test. */
export const PHONE_NAMES = {
  page: concern("home").title,
  pair: PHONE_PAIR,
} as const
