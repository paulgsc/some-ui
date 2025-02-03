import { useCallback, useEffect, useRef, useState } from "react"
import { SplayTree } from "@overlays/utils"
import type { RawNodeDatum } from "react-d3-tree"
import { Tree } from "react-d3-tree"

const SplayTreeAnimation = (): React.JSX.Element => {
  const [tree, setTree] = useState(() => new SplayTree())
  const [treeData, setTreeData] = useState<RawNodeDatum | undefined>(undefined)
  const [_, setMessage] = useState("")
  const intervalRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })

  const updateTreeData = useCallback(() => {
    setTreeData(tree.toJSON())
  }, [tree])

  const getTreeDepth = useCallback(() => {
    return tree.getHeight() || 0
  }, [tree])

  const getRandomKey = (): number => {
    return Math.floor(Math.random() * 100)
  }

  const chooseOperation = useCallback(() => {
    const depth = getTreeDepth()
    const random = Math.random()

    if (depth < 4) {
      return "insert"
    }

    if (depth <= 10) {
      return random < 0.5 ? "insert" : "find"
    }

    if (depth <= 15) {
      if (random < 0.3) return "insert"
      if (random < 0.6) return "find"
      return "remove"
    }

    if (depth <= 20) {
      // Removes twice as likely as finds, inserts half as likely as finds
      if (random < 0.2) return "insert"
      if (random < 0.5) return "find"
      return "remove"
    }

    // Only finds and removes above depth 20
    return random < 0.4 ? "find" : "remove"
  }, [getTreeDepth])

  const performOperation = useCallback(() => {
    const operation = chooseOperation()
    const key = getRandomKey()

    setTree((prevTree) => {
      const newTree = new SplayTree()
      Object.assign(newTree, prevTree)

      switch (operation) {
        case "insert":
          newTree.insert(key)
          setMessage(`Inserted ${key}`)
          break
        case "find": {
          const found = newTree.find(key)
          setMessage(found ? `Found ${key}` : `${key} not found`)
          break
        }
        case "remove": {
          const removed = newTree.remove(key)
          setMessage(removed ? `Removed ${key}` : `${key} not found`)
          break
        }
      }

      return newTree
    })
  }, [chooseOperation])

  useEffect(() => {
    updateTreeData()
  }, [updateTreeData])

  useEffect(() => {
    // Start animation cycle
    intervalRef.current = setInterval(performOperation, 1000)

    return (): void => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [performOperation])

  useEffect(() => {
    if (containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect()
      setTranslate({
        x: width / 2,
        y: height / 8,
      })
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 rounded border border-gray-300 bg-white"
    >
      {treeData && (
        <Tree
          data={treeData}
          orientation="vertical"
          pathFunc="step"
          translate={translate}
          separation={{ siblings: 1, nonSiblings: 2 }}
          nodeSize={{ x: 100, y: 100 }}
        />
      )}
    </div>
  )
}
export default SplayTreeAnimation
