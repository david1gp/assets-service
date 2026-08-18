import { readdir, readFile, stat } from "node:fs/promises"
import { basename, extname, join, normalize, relative, resolve } from "node:path"
import ts from "typescript"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

type AssetClass = "image" | "video" | "font" | "document"

type StaticReferenceCountsInput = {
  root: string
  assets: readonly { key: string; path: string; class?: AssetClass }[]
  locations?: readonly string[]
  generatedListPaths?: readonly string[]
}

type SourceFileEntry = { absolutePath: string; relativePath: string }
type AssetReference = { key: string; path: string; class?: AssetClass }
type StringReferenceContext = { className?: AssetClass; includeKeys?: boolean }

export const staticReferenceCountsCreate = async (
  input: StaticReferenceCountsInput,
): Promise<Result<Record<string, number>>> => {
  const op = "staticReferenceCountsCreate"
  const assets = [...input.assets].sort((left, right) => left.key.localeCompare(right.key))
  const counts = new Map(assets.map((asset) => [asset.key, 0]))
  const properties = new Map<AssetClass, Map<string, string>>()
  const paths = new Map<string, AssetReference[]>()
  const keys = new Map<string, AssetReference[]>()

  for (const asset of assets) {
    const classes = asset.class === undefined ? (["image", "video", "font", "document"] as const) : [asset.class]
    for (const className of classes) {
      const classProperties = properties.get(className) ?? new Map<string, string>()
      classProperties.set(asset.key, asset.key)
      properties.set(className, classProperties)
    }
    referencePathAdd(paths, asset.path, asset)
    referencePathAdd(keys, asset.key, asset)
  }

  const files = await sourceFilesRead(input.root, input.locations ?? [])
  if (!files.success) return files
  const generatedPaths = new Set(
    [
      "src/app/assets/imageList.ts",
      "src/app/assets/videoList.ts",
      "src/app/assets/fontList.ts",
      "src/app/assets/documentList.ts",
      ...(input.generatedListPaths ?? []),
    ].map((filePath) => pathNormalize(resolve(input.root, filePath))),
  )

  for (const file of files.data) {
    if (generatedPaths.has(pathNormalize(file.absolutePath))) continue
    const extension = extname(file.absolutePath).toLowerCase()
    let content: string
    try {
      content = await readFile(file.absolutePath, "utf8")
    } catch (error) {
      return resultErrorCreate(op, `Could not read ${file.relativePath}`, errorMessageCreate(error))
    }
    if (extension === ".html" || extension === ".htm") {
      staticHtmlReferencesCount(content, counts, paths)
      continue
    }
    if (extension === ".ts" || extension === ".tsx") {
      staticTypeScriptReferencesCount(content, file.absolutePath, counts, paths, keys, properties)
    }
  }

  return {
    success: true,
    data: Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right))),
  }
}

async function sourceFilesRead(root: string, locations: readonly string[]): Promise<Result<SourceFileEntry[]>> {
  const op = "staticReferenceSourceFilesRead"
  const resolvedRoot = resolve(root)
  const requested =
    locations.length === 0 ? [resolvedRoot] : locations.map((location) => resolve(resolvedRoot, location))
  const files: SourceFileEntry[] = []
  try {
    for (const location of requested) await sourcePathCollect(resolvedRoot, location, files)
  } catch (error) {
    return resultErrorCreate(op, errorMessageCreate(error))
  }
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  return { success: true, data: files }
}

async function sourcePathCollect(root: string, sourcePath: string, files: SourceFileEntry[]): Promise<void> {
  const sourceStat = await stat(sourcePath)
  if (sourceStat.isFile()) {
    if (sourceFileSupported(sourcePath)) files.push(sourceFileEntryCreate(root, sourcePath))
    return
  }
  if (!sourceStat.isDirectory() || ignoredReferenceDirectory(sourcePath)) return
  const entries = await readdir(sourcePath, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    await sourcePathCollect(root, join(sourcePath, entry.name), files)
  }
}

function sourceFileEntryCreate(root: string, absolutePath: string): SourceFileEntry {
  return { absolutePath, relativePath: relative(root, absolutePath).split("\\").join("/") }
}

function sourceFileSupported(filePath: string): boolean {
  return !filePath.endsWith(".d.ts") && new Set([".ts", ".tsx", ".html", ".htm"]).has(extname(filePath).toLowerCase())
}

function ignoredReferenceDirectory(sourcePath: string): boolean {
  return new Set([".git", "node_modules", "dist", "build", ".assets-service"]).has(basename(sourcePath))
}

function staticTypeScriptReferencesCount(
  content: string,
  filePath: string,
  counts: Map<string, number>,
  paths: ReadonlyMap<string, readonly AssetReference[]>,
  keys: ReadonlyMap<string, readonly AssetReference[]>,
  properties: ReadonlyMap<AssetClass, ReadonlyMap<string, string>>,
): void {
  const source = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const listBindings = new Map<string, AssetClass>()
  const namespaceBindings = new Set<string>()
  const helperBindings = new Map<string, AssetClass>()
  const helperNamespaces = new Set<string>()

  for (const declaration of source.statements) {
    if (!ts.isImportDeclaration(declaration) || !declaration.importClause?.namedBindings) continue
    const bindings = declaration.importClause.namedBindings
    if (ts.isNamespaceImport(bindings)) {
      namespaceBindings.add(bindings.name.text)
      helperNamespaces.add(bindings.name.text)
      continue
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text
      const listClass = listClassRead(imported)
      if (listClass !== undefined) listBindings.set(element.name.text, listClass)
      const helperClass = helperClassRead(imported)
      if (helperClass !== undefined) helperBindings.set(element.name.text, helperClass)
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) staticVariableBindingsRead(node, listBindings, counts, properties)
    if (ts.isPropertyAccessExpression(node)) {
      const listClass = listClassReadFromExpression(node.expression, listBindings, namespaceBindings)
      if (listClass !== undefined) countProperty(node.name.text, listClass, counts, properties)
    }
    if (ts.isElementAccessExpression(node)) {
      const listClass = listClassReadFromExpression(node.expression, listBindings, namespaceBindings)
      const property = staticStringRead(node.argumentExpression)
      if (listClass !== undefined && property !== undefined) countProperty(property, listClass, counts, properties)
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const reference = typeScriptStringReferenceRead(node, helperBindings, helperNamespaces)
      if (reference !== null) {
        for (const asset of referencePathsRead(node.text, paths, keys, reference.className, reference.includeKeys))
          increment(counts, asset.key)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

function staticVariableBindingsRead(
  declaration: ts.VariableDeclaration,
  listBindings: Map<string, AssetClass>,
  counts: Map<string, number>,
  properties: ReadonlyMap<AssetClass, ReadonlyMap<string, string>>,
): void {
  if (declaration.initializer === undefined) return
  const listClass = ts.isIdentifier(declaration.initializer)
    ? listBindings.get(declaration.initializer.text)
    : undefined
  if (listClass !== undefined && ts.isIdentifier(declaration.name)) listBindings.set(declaration.name.text, listClass)
  if (!ts.isObjectBindingPattern(declaration.name) || listClass === undefined) return
  for (const element of declaration.name.elements) {
    const propertyName = element.propertyName ?? (ts.isIdentifier(element.name) ? element.name : undefined)
    if (propertyName === undefined || !ts.isIdentifier(propertyName)) continue
    countProperty(propertyName.text, listClass, counts, properties)
  }
}

function listClassRead(value: string): AssetClass | undefined {
  if (value === "imageList") return "image"
  if (value === "videoList") return "video"
  if (value === "fontList") return "font"
  if (value === "documentList") return "document"
  return undefined
}

function helperClassRead(value: string): AssetClass | undefined {
  if (value === "urlImage") return "image"
  if (value === "urlVideo") return "video"
  if (value === "urlFont") return "font"
  return undefined
}

function listClassReadFromExpression(
  expression: ts.Expression,
  listBindings: ReadonlyMap<string, AssetClass>,
  namespaceBindings: ReadonlySet<string>,
): AssetClass | undefined {
  if (ts.isIdentifier(expression)) return listBindings.get(expression.text)
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    if (!namespaceBindings.has(expression.expression.text)) return undefined
    return listClassRead(expression.name.text)
  }
  if (ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    if (!namespaceBindings.has(expression.expression.text)) return undefined
    const property = staticStringRead(expression.argumentExpression)
    return property === undefined ? undefined : listClassRead(property)
  }
  return undefined
}

function typeScriptStringReferenceRead(
  node: ts.StringLiteralLike,
  helperBindings: ReadonlyMap<string, AssetClass>,
  helperNamespaces: ReadonlySet<string>,
): StringReferenceContext | null {
  const parent = node.parent
  if (ts.isJsxAttribute(parent)) {
    return htmlAssetAttributeRead(parent.name.getText().toLocaleLowerCase()) ? {} : null
  }
  if (!ts.isCallExpression(parent) || !parent.arguments.some((argument) => argument === node)) return {}
  const expression = parent.expression
  if (ts.isIdentifier(expression)) {
    const className = helperBindings.get(expression.text) ?? helperClassRead(expression.text)
    return className === undefined ? {} : { className, includeKeys: true }
  }
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
    if (!helperNamespaces.has(expression.expression.text)) return {}
    const className = helperClassRead(expression.name.text)
    return className === undefined ? {} : { className, includeKeys: true }
  }
  return {}
}

function staticStringRead(expression: ts.Expression | undefined): string | undefined {
  if (expression === undefined) return undefined
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text
  return undefined
}

function staticHtmlReferencesCount(
  content: string,
  counts: Map<string, number>,
  paths: ReadonlyMap<string, readonly AssetReference[]>,
): void {
  let index = 0
  while (index < content.length) {
    if (content[index] !== "<") {
      index += 1
      continue
    }
    if (content.startsWith("<!--", index)) {
      const commentEnd = content.indexOf("-->", index + 4)
      index = commentEnd < 0 ? content.length : commentEnd + 3
      continue
    }
    index += 1
    if (content[index] === "!") {
      const declarationEnd = content.indexOf(">", index + 1)
      index = declarationEnd < 0 ? content.length : declarationEnd + 1
      continue
    }
    if (content[index] === "/") index += 1
    const tagStart = index
    while (index < content.length && htmlNameCharacter(content[index] ?? "")) index += 1
    const tagName = content.slice(tagStart, index).toLocaleLowerCase()
    if (tagName.length === 0) continue
    while (index < content.length) {
      while (index < content.length && htmlWhitespace(content[index] ?? "")) index += 1
      if (content[index] === ">") {
        index += 1
        break
      }
      if (content[index] === "/" && content[index + 1] === ">") {
        index += 2
        break
      }
      const attributeStart = index
      while (
        index < content.length &&
        !htmlWhitespace(content[index] ?? "") &&
        content[index] !== "=" &&
        content[index] !== ">"
      )
        index += 1
      const attributeName = content.slice(attributeStart, index).toLocaleLowerCase()
      const assetAttribute = htmlAssetAttributeRead(attributeName)
      while (index < content.length && htmlWhitespace(content[index] ?? "")) index += 1
      if (content[index] !== "=") continue
      index += 1
      while (index < content.length && htmlWhitespace(content[index] ?? "")) index += 1
      const quote = content[index]
      if (quote === '"' || quote === "'") {
        index += 1
        const valueStart = index
        while (index < content.length && content[index] !== quote) index += 1
        if (assetAttribute) htmlReferenceCount(content.slice(valueStart, index), counts, paths, attributeName)
        if (content[index] === quote) index += 1
        continue
      }
      const valueStart = index
      while (index < content.length && !htmlWhitespace(content[index] ?? "") && content[index] !== ">") index += 1
      if (assetAttribute) htmlReferenceCount(content.slice(valueStart, index), counts, paths, attributeName)
    }
    if (tagName === "script" || tagName === "style") {
      const closingStart = content.toLocaleLowerCase().indexOf(`</${tagName}`, index)
      index = closingStart < 0 ? content.length : closingStart
    }
  }
}

function htmlReferenceCount(
  value: string,
  counts: Map<string, number>,
  paths: ReadonlyMap<string, readonly AssetReference[]>,
  attributeName = "",
): void {
  const values =
    attributeName === "srcset" ? value.split(",").map((entry) => entry.trim().split(/\s+/u)[0] ?? "") : [value]
  for (const candidate of values) {
    const decoded = htmlEntityDecode(candidate)
    for (const reference of referencePathsRead(decoded, paths)) increment(counts, reference.key)
  }
}

function referencePathAdd(paths: Map<string, AssetReference[]>, value: string, asset: AssetReference): void {
  const matching = paths.get(pathNormalize(value)) ?? []
  matching.push(asset)
  paths.set(pathNormalize(value), matching)
}

function referencePathsRead(
  value: string,
  paths: ReadonlyMap<string, readonly AssetReference[]>,
  keys: ReadonlyMap<string, readonly AssetReference[]> = new Map(),
  className?: AssetClass,
  includeKeys = false,
): readonly AssetReference[] {
  const candidates = [pathNormalize(value)]
  const urlPath = urlPathRead(value)
  if (urlPath !== undefined) candidates.push(pathNormalize(urlPath))
  const references = [
    ...candidates.flatMap((path) => paths.get(path) ?? []),
    ...(includeKeys ? (keys.get(pathNormalize(value)) ?? []) : []),
  ]
  const unique = new Map<string, AssetReference>()
  for (const reference of references) {
    if (className !== undefined && reference.class !== undefined && reference.class !== className) continue
    unique.set(`${reference.class ?? "unknown"}:${reference.key}`, reference)
  }
  return [...unique.values()]
}

function htmlAssetAttributeRead(name: string): boolean {
  return new Set(["src", "href", "poster", "srcset", "xlink:href"]).has(name)
}

function htmlEntityDecode(value: string): string {
  const entities: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"', sol: "/" }
  let output = ""
  let index = 0
  while (index < value.length) {
    if (value[index] !== "&") {
      output += value[index] ?? ""
      index += 1
      continue
    }
    const end = value.indexOf(";", index + 1)
    if (end < 0 || end - index > 12) {
      output += "&"
      index += 1
      continue
    }
    const entity = value.slice(index + 1, end)
    if (entity.startsWith("#")) {
      const numeric =
        entity[1] === "x" || entity[1] === "X"
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10)
      if (Number.isSafeInteger(numeric) && numeric > 0 && numeric <= 0x10ffff) {
        output += String.fromCodePoint(numeric)
        index = end + 1
        continue
      }
    }
    const decoded = entities[entity]
    if (decoded !== undefined) {
      output += decoded
      index = end + 1
      continue
    }
    output += "&"
    index += 1
  }
  return output
}

function htmlWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r" || value === "\f"
}

function htmlNameCharacter(value: string): boolean {
  const code = value.charCodeAt(0)
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    value === ":" ||
    value === "_" ||
    value === "-"
  )
}

function countProperty(
  property: string,
  className: AssetClass,
  counts: Map<string, number>,
  properties: ReadonlyMap<AssetClass, ReadonlyMap<string, string>>,
): void {
  const key = properties.get(className)?.get(property)
  if (key !== undefined) increment(counts, key)
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function pathNormalize(value: string): string {
  if (value.length === 0) return value
  const withoutQuery = value.split(/[?#]/u, 1)[0] ?? value
  return normalize(withoutQuery.replace(/^\.\//u, "").replace(/^\/+/, "")).split("\\").join("/")
}

function urlPathRead(value: string): string | undefined {
  if (!isAbsoluteUrl(value)) return undefined
  try {
    return new URL(value).pathname
  } catch {
    return undefined
  }
}

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//u.test(value)
}

function errorMessageCreate(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
