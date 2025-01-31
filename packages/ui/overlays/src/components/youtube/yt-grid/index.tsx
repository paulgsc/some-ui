export const YtGrid = (): React.JSX.Element => {
  return (
    <main className="grid min-h-[600px] w-full grid-flow-row gap-0.5 rounded-lg p-2.5 shadow-lg">
      {Array.from({ length: 3 }, (_, i) => (
        <section
          key={i}
          className="grid size-full grid-flow-col items-center border border-red-600 p-1.5 shadow-inner first:rounded-t-lg last:rounded-b-lg"
        >
          {Array.from({ length: 4 }, (_, k) => (
            <div
              key={k}
              className="size-full rounded-xl border-b border-dashed bg-muted-foreground blur-sm"
            />
          ))}
        </section>
      ))}
    </main>
  )
}
