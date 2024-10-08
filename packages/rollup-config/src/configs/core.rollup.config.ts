import type { PackageJsonTypes } from "../types"
import {
  CONFIG_BABEL,
  CONFIG_EXTERNAL_MODULES,
  CONFIG_EXTERNAL_MODULE_SUPPRESS,
  CONFIG_GLOBALS,
  FOLDERS,
  babel,
  createBuildPath,
  createNodeNextSupport,
  kebabToPascalCase,
  resolve,
  terser,
  typescript,
} from "./base.rollup.config"

const creatRollupConfig = (
  packageJson: PackageJsonTypes,
  tsconfig: object,
  customExternal: Array<string> = []
) => {
  const CONFIG_GLOBALS_MODULE = {
    ...CONFIG_GLOBALS,
    react: "React",
    "react/jsx-runtime": "jsxRuntime",
  }

  const CONFIG_GLOBALS_UMD = {
    react: "React",
    "react/jsx-runtime": "jsxRuntime",
  }

  const CONFIG_TYPESCRIPT = {
    ...tsconfig,
  }

  const defaultExternal = Object.keys(CONFIG_GLOBALS_MODULE)
  const finalExternal = [...defaultExternal, ...customExternal]

  return [
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
          plugins: [resolve(CONFIG_EXTERNAL_MODULES)],
        },
        {
          file: createBuildPath(packageJson, FOLDERS.ESM),
          format: FOLDERS.ESM,
          globals: CONFIG_GLOBALS_MODULE,
          strict: true,
          sourcemap: true,
          plugins: [resolve(CONFIG_EXTERNAL_MODULES)],
        },
      ],
      onwarn: CONFIG_EXTERNAL_MODULE_SUPPRESS,
      plugins: [
        resolve(),
        typescript(CONFIG_TYPESCRIPT),
        babel(CONFIG_BABEL),
        // tscAliasReplacer(),
      ],
      external: finalExternal,
      // Use manual chunking to handle the @shared alias
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
        // tscAliasReplacer(),
        createNodeNextSupport(),
      ],
      external: finalExternal,
      // Use manual chunking to handle the @shared alias
    },
  ]
}

export default creatRollupConfig
