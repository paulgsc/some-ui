export const SignPost = (): React.JSX.Element => {
  return (
    // eslint-disable-next-line theme-protocol/no-structural-palette-color -- a brushed-metal pole: the white-to-near-black radial *is* the cylindrical highlight that makes it read as a rod. Theming either stop flattens it.
    <div className="h-100 w-5 rounded-md shadow-lg bg-radial-[at_25%_25%] from-white to-zinc-900 to-75%" />
  )
}
