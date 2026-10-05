/**
 * Compile-time contract between the hand-written wasm surface in
 * `types/leetype.ts` and the declarations `wasm-pack` actually published.
 * Exports nothing a caller uses: it makes `tsc` fail at the seam when the
 * installed `@some-ui/leetype-wasm` stops agreeing with this workspace.
 *
 * Zod guards the *payloads* at runtime (`serde-wasm-bindgen` hands back
 * untyped values). This guards the *call surface*: which methods exist,
 * their arities, the constructor. Without it, a crate missing methods the
 * wrapper calls only surfaced as `this.instance.tick is not a function` in a
 * browser, since the `@some-ui/leetype-wasm` stub was once checked against
 * itself.
 *
 *   call surface  → checked here, at compile time, against the crate
 *   payload shape → checked by Zod, at runtime, at the seam
 *
 * JsValue-returning methods are `any` in the generated `.d.ts`, so payload
 * drift stays a runtime discovery; the last assertion below is the
 * tripwire for when that becomes fixable. The import reaches the installed
 * package, so bumping it re-checks this file.
 */
import type { TypingGameWasm, WasmModule } from "@leetype/types/leetype"

/**
 * The declarations wasm-pack emits, exactly as published. By subpath because
 * tsconfig maps the bare specifier to the stub next door; `typeof import`
 * because two assertions reflect over the whole export set.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- reflecting over the module's export set requires the whole module type; a named import cannot express "everything the crate exports"
type Generated = typeof import("@some-ui/leetype-wasm/dist/leetype_wasm")

/** The generated `TypingGame` as an instance, which is what we wrap. */
type GeneratedGame = InstanceType<Generated["TypingGame"]>

type Assert<Check extends true> = Check

type Extends<A, B> = [A] extends [B] ? true : false

type IsNever<T> = [T] extends [never] ? true : false

type IsAny<T> = 0 extends 1 & T ? true : false

/** wasm-pack's loader exports: not engine surface, so the "nothing unwrapped" check ignores them. */
type LoaderPlumbing = "default" | "initSync"

/** Engine methods the published class has that `TypingGameWasm` does not. */
type UnwrappedMethods = Exclude<
  Extract<keyof GeneratedGame, string>,
  keyof TypingGameWasm
>

/** Module exports the published bindings have that `WasmModule` does not. */
type UnwrappedExports = Exclude<
  Extract<keyof Generated, string>,
  keyof WasmModule | LoaderPlumbing
>

/** Argument counts the constructor admits — a union, since some are optional. */
type OurArity = ConstructorParameters<WasmModule["TypingGame"]>["length"]
type GeneratedArity = ConstructorParameters<Generated["TypingGame"]>["length"]

/**
 * Each entry is `true` or the build stops. Read a `Type 'false' does not
 * satisfy the constraint 'true'` here as "the crate moved and this
 * workspace has not caught up" — the comment on the failing line says what
 * moved.
 */
export type LeetypeWasmBindingContract = [
  /**
   * The published bindings still satisfy everything `WasmModule` claims.
   * Fails on a method the crate dropped or has not shipped, a return type
   * that changed kind (`Int32Array` → `Uint32Array`), or an argument type
   * that no longer accepts what we pass.
   */
  Assert<Extends<Generated, WasmModule>>,

  /**
   * Nothing new arrived unwrapped: an added method would satisfy the check
   * above but cross the boundary unvalidated. Fix by adding it to
   * `TypingGameWasm` and wrapping it in the loader with a Zod parse.
   */
  Assert<IsNever<UnwrappedMethods>>,

  /** Same, for free functions rather than methods on the game. */
  Assert<IsNever<UnwrappedExports>>,

  /**
   * The constructor takes the same number of arguments on both sides.
   * Separate because TypeScript lets a constructor with *fewer* parameters
   * satisfy one with more, which would silently drop the calibration
   * arguments. Both directions, since optional parameters make each arity a
   * union.
   */
  Assert<Extends<OurArity, GeneratedArity>>,
  Assert<Extends<GeneratedArity, OurArity>>,

  /**
   * The payload seam is still opaque, so only Zod can check it. A tripwire
   * on an *improvement*: fails the day the crate emits real payload types
   * (`tsify`, `typescript_custom_section`), when the schemas should be
   * asserted field-for-field against them (`Assert<IsEqual<Snapshot,
   * Generated.Snapshot>>`).
   */
  Assert<IsAny<ReturnType<GeneratedGame["snapshot"]>>>,
]
