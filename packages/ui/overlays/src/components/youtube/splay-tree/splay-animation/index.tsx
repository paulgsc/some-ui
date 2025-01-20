import { useCallback, useEffect, useState } from "react"
import { Tree } from "react-d3-tree"

import { SplayTree } from "../utils/splay-tree"

const SplayTreeVisualization = () => {
  const [tree, setTree] = useState(() => new SplayTree())
  const [treeData, setTreeData] = useState<any>(null)
  const [inputValue, setInputValue] = useState("")
  const [message, setMessage] = useState("")

  const updateTreeData = useCallback(() => {
    setTreeData(tree.toJSON())
  }, [tree])

  useEffect(() => {
    updateTreeData()
  }, [updateTreeData])

  const handleInsert = () => {
    const key = Number.parseInt(inputValue)
    if (isNaN(key)) {
      setMessage("Please enter a valid number")
      return
    }
    setTree((prevTree) => {
      const newTree = new SplayTree()
      Object.assign(newTree, prevTree)
      newTree.insert(key)
      return newTree
    })
    setMessage(`Inserted ${key}`)
    setInputValue("")
  }

  const handleFind = () => {
    const key = Number.parseInt(inputValue)
    if (isNaN(key)) {
      setMessage("Please enter a valid number")
      return
    }
    setTree((prevTree) => {
      const newTree = new SplayTree()
      Object.assign(newTree, prevTree)
      const found = newTree.find(key)
      setMessage(found ? `Found ${key}` : `${key} not found`)
      return newTree
    })
    setInputValue("")
  }

  const handleRemove = () => {
    const key = Number.parseInt(inputValue)
    if (isNaN(key)) {
      setMessage("Please enter a valid number")
      return
    }
    setTree((prevTree) => {
      const newTree = new SplayTree()
      Object.assign(newTree, prevTree)
      const removed = newTree.remove(key)
      setMessage(removed ? `Removed ${key}` : `${key} not found`)
      return newTree
    })
    setInputValue("")
  }

  const handleVerify = () => {
    const verificationResult = tree.verifyTree()
    setMessage(verificationResult.join("\n"))
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-4">
      <h1 className="mb-4 text-3xl font-bold">Splay Tree Visualization</h1>
      <div className="mb-4 flex">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="rounded-l border border-gray-300 px-4 py-2"
          placeholder="Enter a number"
        />
        <button
          onClick={handleInsert}
          className="bg-blue-500 px-4 py-2 text-white"
        >
          Insert
        </button>
        <button
          onClick={handleFind}
          className="bg-green-500 px-4 py-2 text-white"
        >
          Find
        </button>
        <button
          onClick={handleRemove}
          className="bg-red-500 px-4 py-2 text-white"
        >
          Remove
        </button>
        <button
          onClick={handleVerify}
          className="rounded-r bg-yellow-500 px-4 py-2 text-white"
        >
          Verify Tree
        </button>
      </div>
      <p className="mb-4 whitespace-pre-line">{message}</p>
      <div className="h-[600px] w-full rounded border border-gray-300 bg-white">
        {treeData && (
          <Tree
            data={treeData}
            orientation="vertical"
            pathFunc="step"
            translate={{ x: 300, y: 50 }}
            separation={{ siblings: 1, nonSiblings: 2 }}
            nodeSize={{ x: 100, y: 100 }}
          />
        )}
      </div>
    </div>
  )
}

export default SplayTreeVisualization
