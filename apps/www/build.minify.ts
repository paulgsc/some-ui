/**
 * How production builds are minified (vite.config.ts's `output.minify`):
 * mangled, with `console.*` calls stripped (terser's `drop_console`, carried
 * over to oxc). One object, so the test that a reported failure still
 * reaches the console after this pass (`src/lib/intent/__tests__/
 * release-console.test.ts`) minifies exactly as a release does.
 */
export const RELEASE_MINIFY = {
  compress: { dropConsole: true },
  mangle: true,
} as const
