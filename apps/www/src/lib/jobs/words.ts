/**
 * What Jobs says about where today's picks come from, in the person's terms:
 * what is on this phone and what brings the rest, never the machinery behind
 * it (`__tests__/words.test.ts` holds it to the list in
 * `lib/home-link/__tests__/machinery.ts`).
 */

/** The digest on show is from an earlier day than today's. */
export const notToday = (day: string): string =>
  `These are ${day}’s picks. Today’s aren’t on this phone yet.`

/** Where today's picks come from when the phone is kept on home. */
export const arriveOnTheirOwn =
  "On the home Wi-Fi, today’s picks arrive by themselves: tap the home mark at the top and keep Jobs on home."

/** The picker, as the way in. */
export const openFromStorage = "Open today’s picks from storage"

/** The picker, once it is not the way in. */
export const orOpenFile = "Or open them from Drive"
