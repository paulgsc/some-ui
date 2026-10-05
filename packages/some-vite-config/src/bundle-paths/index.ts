// Checks a written build against what its profile may carry (AUDIENCES.md,
// "Paths"). Vite-free: it reads files, so a script can run it without a
// bundler in process.
export * from "./glob.js"
export * from "./read.js"
export * from "./rules.js"
export * from "./sourcemap.js"
