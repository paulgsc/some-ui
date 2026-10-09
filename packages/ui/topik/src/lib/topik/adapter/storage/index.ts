/** The part of `Storage` the applet's stores read and write through. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">
