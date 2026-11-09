/**
 * The keys of Rust Rounds' kept records on the phone, apart from their
 * readers, so the Practice Home card's entry (`src/entry.ts`) names them
 * without loading the formats' schemas.
 */
export const LOG_KEY = "some-ui:rust-rounds.log"
export const HELD_KEY = "some-ui:rust-rounds.held"
export const PLACE_KEY = "some-ui:rust-rounds.place"

/** The weeks the phone holds (RR13, `lib/weeks`). */
export const WEEKS_KEY = "some-ui:rust-rounds.weeks"
/** The weeks sent (RR13, `lib/week-play/store`). */
export const WEEK_SENT_KEY = "some-ui:rust-rounds.week-sent"
/** The week's takes, on apps/www's desk (`lib/rust-rounds`'s `rustWeekDesk`). */
export const WEEK_TAKES_KEY = "some-ui:rust-rounds.week-takes"
/** What this phone knows home keeps of the weeks sent, the pastes and the log (RR14, `lib/kept-home`). */
export const ON_HOME_KEY = "some-ui:rust-rounds.on-home"
