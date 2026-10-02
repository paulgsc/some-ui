/**
 * What an account holds on the server, in the words both screens use.
 *
 * Said once because it was said twice and the two drifted: the sign-up screen
 * listed sessions and their times, while the settings screen's own deletion
 * copy (and the server) also covered shelf items and reminders. A person
 * deciding whether to make an account reads the sign-up screen, so it is the
 * one that must be complete. `paulgsc/server` `docs/identity.md`, "What is
 * still exposed", is the source of truth for what the server stores.
 */
export const ACCOUNT_KEEPS =
  "An account is a random ID and the public keys of its passkeys, with no name, email or phone number asked for. While you're signed in, the server stores under that ID your sessions and when you start and finish them, and the items you save to shelves. If you turn on reminders, it also stores your device's push address and when reminders were sent."
