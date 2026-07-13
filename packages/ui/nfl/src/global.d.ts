// global.d.ts or images.d.ts
declare module "*.png" {
  const value: string
  export default value
}

declare module "*.jpg" {
  const value: string
  export default value
}

declare module "*.svg" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any
  export default content
}
