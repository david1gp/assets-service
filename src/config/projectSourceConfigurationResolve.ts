import { isAbsolute, relative, resolve, sep } from "node:path"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ProjectSourceConfiguration } from "./projectSourceConfigurationSchema.js"

const sourceClasses = ["image", "video", "document", "font"] as const
const windowsAbsolutePath = /^[A-Za-z]:[\\/]/u

const pathWithinRoot = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate)
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

export const projectSourceConfigurationResolve = (
  projectRoot: string,
  configuration: ProjectSourceConfiguration,
): Result<ProjectSourceConfiguration> => {
  const op = "projectSourceConfigurationResolve"
  const root = resolve(projectRoot)
  const resolved: ProjectSourceConfiguration = { image: null, video: null, document: null, font: null }
  for (const assetClass of sourceClasses) {
    const source = configuration[assetClass]
    if (source === null) continue
    if (source.includes("\u0000") || source.includes("\\") || isAbsolute(source) || windowsAbsolutePath.test(source))
      return resultErrorCreate(op, `The ${assetClass} source directory must be a relative path inside the project root`)
    const sourceRoot = resolve(root, source)
    if (!pathWithinRoot(root, sourceRoot))
      return resultErrorCreate(op, `The ${assetClass} source directory is outside the project root`)
    resolved[assetClass] = sourceRoot
  }

  for (let leftIndex = 0; leftIndex < sourceClasses.length; leftIndex += 1) {
    const leftClass = sourceClasses[leftIndex]
    if (leftClass === undefined) continue
    const leftRoot = resolved[leftClass]
    if (leftRoot === null) continue
    for (let rightIndex = leftIndex + 1; rightIndex < sourceClasses.length; rightIndex += 1) {
      const rightClass = sourceClasses[rightIndex]
      if (rightClass === undefined) continue
      const rightRoot = resolved[rightClass]
      if (rightRoot === null) continue
      if (pathWithinRoot(leftRoot, rightRoot) || pathWithinRoot(rightRoot, leftRoot))
        return resultErrorCreate(op, `The ${leftClass} and ${rightClass} source directories overlap`)
    }
  }
  return { success: true, data: resolved }
}
