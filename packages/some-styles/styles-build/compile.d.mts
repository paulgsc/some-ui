export type CompileStylesOptions = {
  /** Absolute source globs to scan. */
  content: Array<string>
  /** Absolute CSS entry. Defaults to the canonical @some-ui/styles/tailwind.css. */
  entry?: string
  /** Absolute output path. When set, the compiled CSS is written there. */
  outFile?: string
  /** Minify output. Defaults to true. */
  minify?: boolean
}

/**
 * Compile the shared Tailwind layer in a single deterministic pass over
 * `content`. Returns the CSS; also writes it to `outFile` when provided.
 */
export declare function compileStyles(
  options: CompileStylesOptions
): Promise<{ css: string; outFile?: string }>
