import type { PackageJsonTypes } from "../types"
import {
  babel,
  CONFIG_BABEL,
  CONFIG_EXTERNAL_MODULE_SUPPRESS,
  CONFIG_EXTERNAL_MODULES,
  CONFIG_GLOBALS,
  createBuildPath,
  createNodeNextSupport,
  FOLDERS,
  kebabToPascalCase,
  postcss,
  resolve,
  terser,
  typescript,
} from "./base.rollup.config"

type RollupConfigOptions = {
  packageJson: PackageJsonTypes
  tsconfig?: `${string}/tsconfig.build.json` | false
  aliasPath?: {
    aliasKey: string
    pathVal: string
  }
}

export default function ({
  tsconfig = false,
  packageJson,
}: RollupConfigOptions) {
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
    tsconfig: tsconfig === false ? "./tsconfig.json" : (tsconfig as string),
  }

  const defaultExternal = Object.keys(CONFIG_GLOBALS_MODULE)
  const externalModules = [
    ...new Set([
      ...defaultExternal,
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
      "react-router-dom",
      "next",
    ]),
  ]

  // const { aliasKey, pathVal } = aliasPath
  // const entries = [
  //   {
  //     find: aliasKey,
  //     replacement: pathVal,
  //   },
  // ]
  const input = "src/index.ts"

  return [
    {
      input,
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
        // alias({ entries: entries }),
        typescript(CONFIG_TYPESCRIPT),
        babel(CONFIG_BABEL),
        postcss({
          plugins: [require("tailwindcss"), require("autoprefixer")],
          extract: true,
        }),
      ],
      external: externalModules,
    },
    {
      input,
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
        postcss({
          plugins: [require("tailwindcss"), require("autoprefixer")],
          extract: true,
        }),
        createNodeNextSupport(),
      ],
      external: externalModules,
    },
  ]
}
