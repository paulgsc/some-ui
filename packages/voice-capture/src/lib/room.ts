/**
 * The device's one storage budget, as the audio stores see it. Before a
 * write that adds `bytes`, a store asks `fitsRoom`; the app installs the
 * check once, where it can measure everything the device holds
 * (`setStorageRoom`). No store reserves space: what one holds is room the
 * others no longer have, so a new store needs nothing but this call. A
 * store keeps its own cap besides, which is its rule, not the budget's.
 *
 * Without an installed check every write fits: the web builds, and tests.
 * A check that fails to measure lets the write through: a save is not
 * refused for want of a number.
 */
export type StorageRoom = (bytes: number) => Promise<boolean>

let room: StorageRoom = () => Promise.resolve(true)

export function setStorageRoom(check: StorageRoom): void {
  room = check
}

/**
 * Ask before opening the write's IndexedDB transaction: one left waiting on
 * this while another store is read auto-commits. `bytes` is the write's
 * growth: less what it replaces or displaces (`bytesOf`), so a redo that
 * grows nothing always fits.
 */
export async function fitsRoom(bytes: number): Promise<boolean> {
  try {
    return await room(bytes)
  } catch {
    return true
  }
}
