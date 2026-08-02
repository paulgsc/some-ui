/**
 * Compile-time contract between the hand-written wasm surface in
 * `types/leetype.ts` and the declarations `wasm-pack` actually published.
 *
 * This file exports nothing a caller uses. It exists so that `tsc` fails —
 * loudly, at the seam, with no test run and no browser — when the installed
 * `@some-ui/leetype-wasm` stops agreeing with what this workspace believes
 * the engine exposes.
 *
 * ## Why it was needed
 *
 * The Zod schemas next door guard the *payloads* crossing the boundary, and
 * that is the right place for them: `serde-wasm-bindgen` hands JS untyped
 * values, so a field the engine renamed can only be caught by looking at a
 * real value at runtime. But payloads were never the whole surface. Nothing
 * guarded the *call surface* — which methods exist, their arities, the
 * constructor — and there the drift was silent in both directions:
 *
 *   - `TypingGameWasm` named `tick`, `calibrate`, `progression`,
 *     `retry_chunk` and `visibility`, and `WasmModule["TypingGame"]` took a
 *     four-argument constructor, while the installed crate was 0.0.9, which
 *     shipped none of them and took two arguments.
 *   - `tsc` agreed anyway, because `@some-ui/leetype-wasm` resolves to
 *     `./leetype-wasm.d.ts`, and that stub used to derive `TypingGame` from
 *     `WasmModule`. The wrapper was being checked against itself.
 *
 * So the first honest signal was `this.instance.tick is not a function`, in
 * a browser, from a caller several layers from the cause. The stub now
 * derives from the published declarations instead, which closes the loop;
 * the assertions below are what makes a break in that loop legible rather
 * than showing up as a confusing error inside the loader.
 *
 * ## What it can and cannot check
 *
 * Every JsValue-returning method types as `any` in the generated `.d.ts`,
 * because the crate projects through `serde_wasm_bindgen::to_value` and
 * wasm-bindgen has no field-level type to emit. So the split is:
 *
 *   call surface  → checked here, at compile time, against the crate
 *   payload shape → checked by Zod, at runtime, at the seam
 *
 * `SnapshotSchema` gaining a field the Rust struct does not have is still
 * a runtime discovery. `PayloadsAreStillOpaque` at the bottom is the
 * tripwire for the day that becomes fixable.
 *
 * Bump `@some-ui/leetype-wasm` and this file re-checks itself: the import
 * below reaches into the installed package, not a vendored copy, so the
 * check always describes the version `package.json` actually resolves to.
 */
import type { TypingGameWasm, WasmModule } from "@leetype/types/leetype"

/**
 * The declarations wasm-pack emits, exactly as published.
 *
 * Reached by subpath rather than by the bare specifier because the bare one
 * is mapped in tsconfig.json to the stub next door — which is derived from
 * this same file and so has nothing independent to say. The mapping has no
 * wildcard, so this deeper path resolves through `node_modules` as usual.
 *
 * `typeof import(...)` rather than named imports because two of the
 * assertions below reflect over the module's *export set* — "did a function
 * appear that nothing here wraps?" — and a named import can only name
 * exports we already know about, which is the question being asked.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- reflecting over the module's export set requires the whole module type; a named import cannot express "everything the crate exports"
type Generated = typeof import("@some-ui/leetype-wasm/dist/leetype_wasm")

/** The generated `TypingGame` as an instance, which is what we wrap. */
type GeneratedGame = InstanceType<Generated["TypingGame"]>

type Assert<Check extends true> = Check

type Extends<A, B> = [A] extends [B] ? true : false

type IsNever<T> = [T] extends [never] ? true : false

type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Module exports wasm-pack adds for its own loading protocol. They are not
 * engine surface, so `WasmModule` deliberately omits them and the
 * "nothing unwrapped" check below has to know to ignore them.
 */
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
   *
   * This is the load-bearing one, and it fails from either side: a method
   * `TypingGameWasm` names that the crate dropped (or has not shipped yet
   * — 0.0.9 fails here on five of them), a return type that changed kind
   * (`slot_of_display` going `Int32Array` → `Uint32Array`), or an argument
   * whose type no longer accepts what we pass.
   */
  Assert<Extends<Generated, WasmModule>>,

  /**
   * Nothing new arrived unwrapped.
   *
   * Assignability above is one-directional: a crate that *adds* a method
   * satisfies `WasmModule` just fine. But an engine method with no
   * `TypedTypingGame` wrapper is an unvalidated way across the boundary,
   * so a new one should be a decision, not an oversight. Fix by adding it
   * to `TypingGameWasm` and wrapping it in the loader — including the Zod
   * parse on whatever it returns.
   */
  Assert<IsNever<UnwrappedMethods>>,

  /** Same, for free functions rather than methods on the game. */
  Assert<IsNever<UnwrappedExports>>,

  /**
   * The constructor takes the same number of arguments on both sides.
   *
   * Needed separately because TypeScript lets a constructor with *fewer*
   * parameters satisfy one that declares more — which is exactly how
   * `new TypingGame(code, maxErrors, baselineWpm, dispersionWpm)` type-
   * checked against 0.0.9's two-argument constructor and silently dropped
   * the calibration the whole reveal loop is a function of. Asserted in
   * both directions because each arity is a union of the lengths an
   * optional parameter admits, and either side may be the wider one.
   */
  Assert<Extends<OurArity, GeneratedArity>>,
  Assert<Extends<GeneratedArity, OurArity>>,

  /**
   * The payload seam is still opaque, so Zod is still the only thing that
   * can check it.
   *
   * A deliberate tripwire on an *improvement*: this fails the day the
   * crate starts emitting real payload interfaces (`tsify`, or a
   * `typescript_custom_section`), because on that day `Snapshot` and
   * friends become checkable at compile time and these schemas should be
   * asserted field-for-field against them — `Assert<IsEqual<Snapshot,
   * Generated.Snapshot>>` and so on — instead of only at runtime. Without
   * this line that day passes unnoticed and the schemas stay a trailing
   * artifact forever.
   */
  Assert<IsAny<ReturnType<GeneratedGame["snapshot"]>>>,
]
