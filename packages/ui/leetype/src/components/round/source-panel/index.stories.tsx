import type { Algorithm } from "@leetype/types/algorithm"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SourcePanel } from "."

const meta: Meta<typeof SourcePanel> = {
  title: "UI/Input/Components/Round/SourcePanel",
  component: SourcePanel,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
}

export default meta
type Story = StoryObj<typeof SourcePanel>

const Phone = ({ algorithm }: { algorithm: Algorithm }) => (
  <div className="mx-auto w-full max-w-[390px] p-3">
    <SourcePanel algorithm={algorithm} />
  </div>
)

const BINARY_SEARCH: Algorithm = {
  source: `export function binarySearch(target: number, values: number[]): number {
  let lo = 0
  let hi = values.length - 1

  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2)
    const at = values[mid]

    if (at === target) return mid
    if (at < target) lo = mid + 1
    else hi = mid - 1
  }

  return -1
}`,
  language: "typescript",
  entryPoint: "binarySearch",
  inputAlphabet: "a sorted i32 array plus a target, both fit in memory",
}

const RUST_MEMO: Algorithm = {
  source: `fn fib(n: u64, memo: &mut std::collections::HashMap<u64, u64>) -> u64 {
    if n <= 1 {
        return n;
    }
    if let Some(&value) = memo.get(&n) {
        return value;
    }
    let result = fib(n - 1, memo) + fib(n - 2, memo);
    memo.insert(n, result);
    result
}`,
  language: "rust",
  entryPoint: "fib",
  inputAlphabet: "a single u64 n, n <= 90",
}

/** Closed by default — the story's own screenshot is the acceptance check for that. */
export const Closed: Story = {
  render: () => <Phone algorithm={BINARY_SEARCH} />,
}

/** A second language, to show the chip and the Prism grammar both follow `algorithm.language`. */
export const RustSource: Story = {
  render: () => <Phone algorithm={RUST_MEMO} />,
}
