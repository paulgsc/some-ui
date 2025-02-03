export type SetStateInternal<T> = {
  _(
    partial: T | Partial<T> | { _(state: T): T | Partial<T> }["_"],
    replace?: false
  ): void
  _(state: T | { _(state: T): T }["_"], replace: true): void
}["_"]
