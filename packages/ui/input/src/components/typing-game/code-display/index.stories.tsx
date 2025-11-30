import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { CodeDisplay } from "."

type Story = StoryObj<typeof CodeDisplay>
type Meta = MetaObj<typeof CodeDisplay>

const typescriptCode = `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(result);`

const rustCode = `fn factorial(n: u32) -> u32 {
    match n {
        0 => 1,
        _ => n * factorial(n - 1),
    }
}

fn main() {
    let result = factorial(5);
    println!("Result: {}", result);
}`

const cppCode = `#include <iostream>
#include <vector>

int main() {
    std::vector<int> nums = {1, 2, 3, 4, 5};
    
    for (const auto& num : nums) {
        std::cout << num << " ";
    }
    
    return 0;
}`

const cCode = `#include <stdio.h>

int main() {
    int arr[] = {1, 2, 3, 4, 5};
    int sum = 0;
    
    for (int i = 0; i < 5; i++) {
        sum += arr[i];
    }
    
    printf("Sum: %d\\n", sum);
    return 0;
}`

const longTypescriptCode = `interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

class UserManager {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  addUser(user: User): void {
    this.users.set(user.id, user);
  }

  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  removeUser(id: string): boolean {
    return this.users.delete(id);
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }
}

const manager = new UserManager();
manager.addUser({ id: "1", name: "Alice", email: "alice@example.com", age: 30 });
manager.addUser({ id: "2", name: "Bob", email: "bob@example.com", age: 25 });

console.log(manager.getAllUsers());`

export default {
  title: "UI/Input/Components/Typing/CodeDisplay",
  component: CodeDisplay,
  argTypes: {
    language: {
      control: "select",
      options: ["typescript", "rust", "cpp", "c"],
    },
    displayMode: {
      control: "select",
      options: ["shown", "hidden"],
    },
    gameState: {
      control: "select",
      options: ["idle", "playing", "finished", "timeout"],
    },
  },
} as Meta

// Default state - idle with no input
export const Default: Story = {
  args: {
    code: typescriptCode,
    userInput: "",
    language: "typescript",
    displayMode: "shown",
    gameState: "idle",
  },
}

// Playing - shown mode
export const PlayingShown: Story = {
  args: {
    code: typescriptCode,
    userInput: "",
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Playing - hidden mode
export const PlayingHidden: Story = {
  args: {
    code: typescriptCode,
    userInput: "",
    language: "typescript",
    displayMode: "hidden",
    gameState: "playing",
  },
}

// Partial progress - correct typing
export const PartialProgressCorrect: Story = {
  args: {
    code: typescriptCode,
    userInput: "function fibonacci(n: number)",
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Partial progress - with errors
export const PartialProgressWithErrors: Story = {
  args: {
    code: typescriptCode,
    userInput: "function fibonaci(n: numer)",
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Hidden mode with partial progress
export const HiddenModePartialProgress: Story = {
  args: {
    code: typescriptCode,
    userInput: "function fibonacci(n: nu",
    language: "typescript",
    displayMode: "hidden",
    gameState: "playing",
  },
}

// Finished state
export const Finished: Story = {
  args: {
    code: typescriptCode,
    userInput: typescriptCode,
    language: "typescript",
    displayMode: "shown",
    gameState: "finished",
  },
}

// Timeout state
export const Timeout: Story = {
  args: {
    code: typescriptCode,
    userInput: "function fibonacci(n: number): number {\n  if (n <= 1)",
    language: "typescript",
    displayMode: "shown",
    gameState: "timeout",
  },
}

// Rust language
export const RustCode: Story = {
  args: {
    code: rustCode,
    userInput: "",
    language: "rust",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Rust with progress
export const RustWithProgress: Story = {
  args: {
    code: rustCode,
    userInput: "fn factorial(n: u32) -> u32 {\n    match n {",
    language: "rust",
    displayMode: "shown",
    gameState: "playing",
  },
}

// C++ language
export const CppCode: Story = {
  args: {
    code: cppCode,
    userInput: "",
    language: "cpp",
    displayMode: "shown",
    gameState: "playing",
  },
}

// C++ with progress
export const CppWithProgress: Story = {
  args: {
    code: cppCode,
    userInput: "#include <iostream>\n#include <vector>\n\nint main() {",
    language: "cpp",
    displayMode: "shown",
    gameState: "playing",
  },
}

// C language
export const CCode: Story = {
  args: {
    code: cCode,
    userInput: "",
    language: "c",
    displayMode: "shown",
    gameState: "playing",
  },
}

// C with progress
export const CWithProgress: Story = {
  args: {
    code: cCode,
    userInput: "#include <stdio.h>\n\nint main() {\n    int arr[]",
    language: "c",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Long code - for testing scrolling
export const LongCode: Story = {
  args: {
    code: longTypescriptCode,
    userInput: "",
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Long code with cursor in middle
export const LongCodeScrolling: Story = {
  args: {
    code: longTypescriptCode,
    userInput: `interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

class UserManager {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  addUser(user: User): void {`,
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Nearly complete
export const NearlyComplete: Story = {
  args: {
    code: typescriptCode,
    userInput: typescriptCode.slice(0, -10),
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Hidden mode nearly complete
export const HiddenModeNearlyComplete: Story = {
  args: {
    code: typescriptCode,
    userInput: typescriptCode.slice(0, -15),
    language: "typescript",
    displayMode: "hidden",
    gameState: "playing",
  },
}

// Multiple errors scattered
export const MultipleErrors: Story = {
  args: {
    code: typescriptCode,
    userInput: "functoin fibonacci(n: numbr): numbr {\n  if (n <= 1) retrn n;",
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Empty code (edge case)
export const EmptyCode: Story = {
  args: {
    code: "",
    userInput: "",
    language: "typescript",
    displayMode: "shown",
    gameState: "idle",
  },
}

// Single line code
export const SingleLine: Story = {
  args: {
    code: "const greeting = 'Hello, World!';",
    userInput: "",
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Single line with progress
export const SingleLineProgress: Story = {
  args: {
    code: "const greeting = 'Hello, World!';",
    userInput: "const greeting = 'Hel",
    language: "typescript",
    displayMode: "shown",
    gameState: "playing",
  },
}

// Idle state with long code
export const IdleLongCode: Story = {
  args: {
    code: longTypescriptCode,
    userInput: "",
    language: "typescript",
    displayMode: "shown",
    gameState: "idle",
  },
}

// Finished with errors
export const FinishedWithErrors: Story = {
  args: {
    code: typescriptCode,
    userInput:
      "functoin fibonacci(n: numbr): numbr {\n  if (n <= 1) retrn n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n\nconst result = fibonacci(10);\nconsole.log(result);",
    language: "typescript",
    displayMode: "shown",
    gameState: "finished",
  },
}
