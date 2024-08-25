/*
 * This file contains code adapted from the Node.js website repository,
 * available at: https://github.com/davidjerleke/embla-carousel
 * The original code is licensed under the MIT License.
 */
//@ts-check
import * as fs from "fs"
import path from "path"
import alias from "@rollup/plugin-alias"
import type { RollupBabelInputPluginOptions } from "@rollup/plugin-babel"
import babel from "@rollup/plugin-babel"
import resolve from "@rollup/plugin-node-resolve"
import terser from "@rollup/plugin-terser"
import typescript from "rollup-plugin-typescript2"

import fileUnKown from "../../../../package.json"
import type { PackageJsonTypes } from "../types"

const packageJson = fileUnKown as unknown as PackageJsonTypes
const FOLDERS = {
  ESM: "esm",
  CJS: "cjs",
  UMD: "umd",
  OUT: "./dist",
} as const

type FOLDERFORMAT = (typeof FOLDERS)[keyof typeof FOLDERS]

const CONFIG_GLOBALS = {
  [packageJson.name]: kebabToPascalCase(packageJson.name),
}

const CONFIG_EXTERNAL_MODULES = {
  moduleDirectories: ["node_modules"],
}

const CONFIG_BABEL: RollupBabelInputPluginOptions = {
  extensions: [".js", ".jsx", ".ts", ".tsx"],
  exclude: ["node_modules/**", "**/*.stories.tsx"],
  babelHelpers: "bundled",
}

// @ts-expect-error headache for now
function CONFIG_EXTERNAL_MODULE_SUPPRESS(warning, next): void {
  if (warning.code === "INPUT_HOOK_IN_OUTPUT_PLUGIN") return
  next(warning)
}

function kebabToPascalCase(string = ""): string {
  return string.replace(/(^\w|-\w)/g, (replaceString) =>
    replaceString.replace(/-/, "").toUpperCase()
  )
}

function addImportExtensions(content: string, extension = "js"): string {
  return content.replace(/from\s'.\/(.*)';/g, (match) =>
    match.replace(/';/g, `.${extension}';`)
  )
}

// @ts-expect-error headache for now
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function readFiles(dirname: string, onFileContent, onError) {
  fs.readdirSync(dirname, { withFileTypes: true }).forEach((entry) => {
    if (entry.isDirectory()) {
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      return readFiles(dirname + entry.name + "/", onFileContent, onError)
    }

    fs.readFile(dirname + entry.name, "utf-8", (error, content) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      if (error) return onError(error)
      onFileContent(dirname + entry.name, content)
    })
  })
}

function createBuildPath(
  packageJson: PackageJsonTypes,
  format: FOLDERFORMAT
): string {
  const fileName = `${packageJson.name}.${format}.js`
  if (format === "umd") return path.join(FOLDERS.OUT, fileName)
  return path.join(FOLDERS.OUT, format, fileName)
}

function createNodeNextSupportForPackage(): void {
  const workspacePath = process.cwd()
  const packageJsonPath = path.join(workspacePath, "package.json")
  const workspacePackageJson = fs.readFileSync(packageJsonPath, "utf-8")

  if (!workspacePackageJson) return

  const outFolder = path.join(workspacePath, FOLDERS.OUT)
  const esmFolder = path.join(workspacePath, FOLDERS.OUT, FOLDERS.ESM)
  const cjsFolder = path.join(workspacePath, FOLDERS.OUT, FOLDERS.CJS)

  const packageJson = JSON.parse(workspacePackageJson) as PackageJsonTypes
  const packageJsonMain = {
    ...packageJson,
    repository: {
      type: "git",
      url: "https://github.com/paulgsc/some-ui",
    },
    bugs: {
      url: "https://github.com/paulgsc/some-ui/issues",
    },
    homepage: "https://pgdev.maishatu.com/?tab=github",
    license: "MIT",
    keywords: [],
    files: [
      `${packageJson.name}*`,
      `${FOLDERS.OUT}/src/**/*`,
      `index.d.ts`,
      `${FOLDERS.OUT}/esm/**/*`,
      `${FOLDERS.OUT}/cjs/**/*`,
    ],
    sideEffects: false,
    unpkg: `${packageJson.name}.umd.js`,
    main: `${FOLDERS.OUT}/${packageJson.name}.umd.js`,
    module: `${FOLDERS.OUT}/${FOLDERS.ESM}/${packageJson.name}.${FOLDERS.ESM}.js`,
    types: "index.d.ts",
    exports: {
      "./package.json": "./package.json",
      ".": {
        import: {
          types: `${FOLDERS.OUT}/${FOLDERS.ESM}/index.d.ts`,
          default: `${FOLDERS.OUT}/${FOLDERS.ESM}/${packageJson.name}.${FOLDERS.ESM}.js`,
        },
        require: {
          types: `${FOLDERS.OUT}/${FOLDERS.CJS}/index.d.ts`,
          default: `${FOLDERS.OUT}/${FOLDERS.CJS}/${packageJson.name}.${FOLDERS.CJS}.js`,
        },
      },
    },
  }

  const propsToDelete = ["scripts", "exports", "main", "unpkg", "module"]

  // @ts-expect-error ignore for now
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  propsToDelete.forEach((prop) => delete packageJson[prop])

  const files = [`${packageJson.name}*`, "src/**/*", "index.d.ts"]
  const packageJsonEsm = {
    ...packageJson,
    module: `${packageJson.name}.${FOLDERS.ESM}.js`,
    files,
    type: "module",
  }
  const packageJsonCjs = {
    ...packageJson,
    main: `${packageJson.name}.${FOLDERS.CJS}.js`,
    files,
    type: "commonjs",
  }

  if (!fs.existsSync(outFolder)) fs.mkdirSync(outFolder)
  if (!fs.existsSync(esmFolder)) fs.mkdirSync(esmFolder)
  if (!fs.existsSync(cjsFolder)) fs.mkdirSync(cjsFolder)

  if (process.env.ENV === "developemnt")
    fs.writeFileSync(
      path.join(".", "package.json"),
      JSON.stringify(packageJsonMain, null, "\t")
    )

  fs.writeFileSync(
    path.join(outFolder, "package.json"),
    JSON.stringify(packageJsonMain, null, "\t")
  )

  fs.writeFileSync(
    path.join(esmFolder, "package.json"),
    JSON.stringify(packageJsonEsm, null, "\t")
  )

  fs.writeFileSync(
    path.join(cjsFolder, "package.json"),
    JSON.stringify(packageJsonCjs, null, "\t")
  )

  const esmTypesFilePath = path.join(esmFolder, "index.d.ts")
  const esmTypesFile = fs.readFileSync(esmTypesFilePath, "utf-8")
  const esmTypesFileWithImportExtensions = addImportExtensions(esmTypesFile)

  fs.writeFileSync(esmTypesFilePath, esmTypesFileWithImportExtensions)
  // @ts-expect-error headache for now
  readFiles(path.join(esmFolder, "/"), (filename, fileContent) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const fileContentWithImportExtensions = addImportExtensions(fileContent)
    // @ts-expect-error headache for now
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function, @typescript-eslint/no-unsafe-argument
    fs.writeFile(filename, fileContentWithImportExtensions, (error) => {})
  })
}

function createNodeNextSupport(): {
  name: string
  closeBundle: () => void
} {
  return {
    name: "createNodeNextSupport",
    closeBundle: createNodeNextSupportForPackage,
  }
}

export {
  alias,
  babel,
  CONFIG_BABEL,
  CONFIG_EXTERNAL_MODULE_SUPPRESS,
  CONFIG_EXTERNAL_MODULES,
  CONFIG_GLOBALS,
  createBuildPath,
  createNodeNextSupport,
  FOLDERS,
  kebabToPascalCase,
  path,
  resolve,
  terser,
  typescript,
}
