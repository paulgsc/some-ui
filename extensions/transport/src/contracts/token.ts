/**
 * Definition 3.1 (Token) — dom-state-estimation-canon.typ §3.
 *
 * A token asserts nothing beyond: "as of local tick `timestamp`, I believe
 * key `key` carries properties `attrs`." It is not a command and not a
 * guarantee. `K` is the extension-defined logical-key type; `Attr` is the
 * extension-defined observable-property shape.
 */
export type Token<K, Attr> = {
  readonly key: K
  readonly attrs: Readonly<Attr>
  readonly timestamp: number
}
