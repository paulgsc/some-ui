export type IPackageJsonDependencyTypes =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies"

export type IPackageJsonAddress = {
  email?: string
  url?: string
}

export type IPackageJsonPerson = {
  name: string
} & IPackageJsonAddress

export type PackageJsonTypes = {
  name: string
  version: string
  description?: string
  keywords?: string
  homepage?: string
  bugs?: IPackageJsonAddress
  license?: string
  author?: string | IPackageJsonPerson
  contributors?: Array<string> | Array<IPackageJsonPerson>
  files?: Array<string>
  main?: string
  browser?: string
  bin?: Record<string, string>
  man?: string
  directories?: {
    lib?: string
    bin?: string
    man?: string
    doc?: string
    example?: string
    test?: string
  }
  repository?: {
    type?: "git"
    url?: string
    directory?: string
  }
  scripts?: Record<string, string>
  config?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  bundledDependencies?: Array<string>
  engines?: Record<string, string>
  os?: Array<string>
  cpu?: Array<string>
}
