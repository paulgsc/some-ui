import {
  babel,
  CONFIG_BABEL,
  CONFIG_EXTERNAL_MODULE_SUPPRESS,
  CONFIG_EXTERNAL_MODULES,
  CONFIG_GLOBALS,
  CONFIG_TYPESCRIPT,
  createBuildPath,
  createNodeNextSupport,
  FOLDERS,
  kebabToPascalCase,
  resolve,
  terser,
  typescript,
} from "../../rollup.config"
import packageJson from "./package.json"

const CONFIG_GLOBALS_MODULE = {
  ...CONFIG_GLOBALS,
  react: "React",
}

const CONFIG_GLOBALS_UMD = {
  react: "React",
}

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: createBuildPath(packageJson, FOLDERS.CJS),
        format: FOLDERS.CJS,
        globals: CONFIG_GLOBALS_MODULE,
        strict: true,
        sourcemap: true,
        exports: "auto",
        plugins: resolve(CONFIG_EXTERNAL_MODULES),
      },
      {
        file: createBuildPath(packageJson, FOLDERS.ESM),
        format: FOLDERS.ESM,
        globals: CONFIG_GLOBALS_MODULE,
        strict: true,
        sourcemap: true,
        plugins: resolve(CONFIG_EXTERNAL_MODULES),
      },
    ],
    onwarn: CONFIG_EXTERNAL_MODULE_SUPPRESS,
    plugins: [resolve(), typescript(CONFIG_TYPESCRIPT), babel(CONFIG_BABEL)],
    external: Object.keys(CONFIG_GLOBALS_MODULE),
  },
  {
    input: "src/index.ts",
    output: [
      {
        file: createBuildPath(packageJson, FOLDERS.UMD),
        format: FOLDERS.UMD,
        globals: CONFIG_GLOBALS_UMD,
        strict: true,
        sourcemap: false,
        name: kebabToPascalCase(packageJson.name),
        plugins: [resolve(), terser()],
      },
    ],
    onwarn: CONFIG_EXTERNAL_MODULE_SUPPRESS,
    plugins: [
      resolve(),
      typescript(CONFIG_TYPESCRIPT),
      babel(CONFIG_BABEL),
      createNodeNextSupport(),
    ],
    external: Object.keys(CONFIG_GLOBALS_UMD),
  },
]
