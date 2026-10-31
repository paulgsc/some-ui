/** Vite's `?raw` suffix: the file's text, bundled as a string. */
declare module "*.md?raw" {
  const content: string
  export default content
}
