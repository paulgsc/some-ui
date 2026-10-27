/**
 * The device's one storage budget, as the audio stores see it. A write that
 * grows the device by `bytes` runs inside `withRoom`; the app installs the
 * check once, where it can measure everything the device holds
 * (`setStorageRoom`). A store keeps its own cap besides, which is its rule,
 * not the budget's.
 *
 * A write's growth is claimed before the budget is measured and held until
 * the write settles (`claimedRoom`), so two writes that overlap cannot both
 * pass on one measurement, and a database save in between counts them too.
 *
 * Without an installed check every write fits: the web builds, and tests.
 * A check that fails to measure lets the write through: a save is not
 * refused for want of a number.
 */
export type StorageRoom = (bytes: number) => Promise<boolean>

let room: StorageRoom = () => Promise.resolve(true)
let claimed = 0

export function setStorageRoom(check: StorageRoom): void {
  room = check
}

/** The growth of writes that passed the check and have not settled yet. */
export function claimedRoom(): number {
  return claimed
}

/**
 * Runs `write` if `bytes` more fit beside what the device holds and what
 * other writes have claimed, else throws `full()`. `bytes` is the write's
 * growth, less what it replaces or displaces (`bytesOf`); one that grows
 * nothing always runs, even on a device already over. Measure what it frees
 * before opening its IndexedDB transaction, and open it inside `write`: one
 * left waiting on the check while another store is read auto-commits.
 *
 * What it frees can change before `write` runs (another write on the same
 * key lands first), so `write` gets the growth it was given room for, and
 * aborts when its transaction would grow the device by more.
 */
export async function withRoom<T>(
  bytes: number,
  write: (claim: number) => Promise<T>,
  full: () => Error
): Promise<T> {
  const growth = Math.max(0, bytes)
  const others = claimed
  claimed += growth
  try {
    let fits = true
    if (growth > 0) {
      try {
        fits = await room(growth + others)
      } catch {
        // Ignored: not measured: a save is not refused for want of a number.
      }
    }
    if (!fits) throw full()
    return await write(growth)
  } finally {
    claimed -= growth
  }
}
