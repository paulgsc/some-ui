class TreeNode {
  key: number
  left: TreeNode | null
  right: TreeNode | null

  constructor(key: number) {
    this.key = key
    this.left = null
    this.right = null
  }
}

export class SplayTree {
  root: TreeNode | null

  constructor() {
    this.root = null
  }

  getHeight(): number {
    const calculateHeight = (node: TreeNode | null): number => {
      if (!node) return 0
      return (
        1 + Math.max(calculateHeight(node.left), calculateHeight(node.right))
      )
    }
    return calculateHeight(this.root)
  }

  getDepthOfNode(key: number): number {
    let depth = 0
    let current = this.root

    while (current) {
      if (current.key === key) return depth
      if (key < current.key) {
        current = current.left
      } else {
        current = current.right
      }
      depth++
    }
    return -1
  }

  splay(key: number): void {
    if (!this.root) return

    const dummy = new TreeNode(0)
    let leftTree = dummy
    let rightTree = dummy
    let t = this.root

    while (true) {
      if (key < t.key) {
        if (!t.left) break
        if (key < t.left.key) {
          // Zig-Zig (Left Left)
          const y = t.left
          t.left = y.right
          y.right = t
          t = y
          if (!t.left) break
        }
        rightTree.left = t
        rightTree = t
        t = t.left
      } else if (key > t.key) {
        if (!t.right) break
        if (key > t.right.key) {
          // Zig-Zig (Right Right)
          const y = t.right
          t.right = y.left
          y.left = t
          t = y
          if (!t.right) break
        }
        leftTree.right = t
        leftTree = t
        t = t.right
      } else {
        break
      }
    }

    leftTree.right = t.left
    rightTree.left = t.right
    t.left = dummy.right
    t.right = dummy.left
    this.root = t
  }

  insert(key: number): void {
    if (!this.root) {
      this.root = new TreeNode(key)
      return
    }

    this.splay(key)

    if (this.root.key === key) return

    const newNode = new TreeNode(key)
    if (key < this.root.key) {
      newNode.right = this.root
      newNode.left = this.root.left
      this.root.left = null
    } else {
      newNode.left = this.root
      newNode.right = this.root.right
      this.root.right = null
    }
    this.root = newNode
  }

  find(key: number): boolean {
    if (!this.root) return false
    this.splay(key)
    return this.root.key === key
  }

  remove(key: number): boolean {
    if (!this.root) return false

    this.splay(key)

    if (this.root.key !== key) return false

    if (!this.root.left) {
      this.root = this.root.right
    } else {
      const rightSubtree = this.root.right
      this.root = this.root.left
      this.splay(key)
      this.root.right = rightSubtree
    }

    return true
  }

  toJSON(): any {
    const convertToJSON = (node: TreeNode | null): any => {
      if (!node) return null
      return {
        name: node.key.toString(),
        attributes: {}, // react-d3-tree expects an attributes object
        children: [convertToJSON(node.left), convertToJSON(node.right)].filter(
          Boolean
        ),
      }
    }

    return this.root ? convertToJSON(this.root) : { name: "Empty Tree" }
  }

  verifyTree(): Array<string> {
    const result: Array<string> = []
    const inOrderTraversal = (node: TreeNode | null): Array<number> => {
      if (!node) return []
      return [
        ...inOrderTraversal(node.left),
        node.key,
        ...inOrderTraversal(node.right),
      ]
    }

    const keys = inOrderTraversal(this.root)
    result.push(`Tree keys in order: ${keys.join(", ")}`)

    if (keys.length > 1) {
      for (let i = 1; i < keys.length; i++) {
        if (keys[i] <= keys[i - 1]) {
          result.push(
            `ERROR: Tree is not properly ordered at ${keys[i - 1]} and ${keys[i]}`
          )
        }
      }
    }

    return result
  }
}
