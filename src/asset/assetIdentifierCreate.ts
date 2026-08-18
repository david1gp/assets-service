import type { Folders } from "./foldersSchema.js"

const reservedTypeScriptWords = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
])

export const assetIdentifierCreate = (folders: Folders, basename: string, outputKey: string): string => {
  const identifier = [...folders, basename, ...(outputKey === "default" ? [] : [outputKey])]
    .map((part) => part.normalize("NFC"))
    .join("_")
    .replace(/[\\/-]/g, "_")
    .replace(/[^\p{ID_Continue}$]/gu, "_")

  if (identifier.length === 0) return "_asset"
  if (/^\d/u.test(identifier)) return `i${identifier}`
  if (!/^[\p{ID_Start}_$]/u.test(identifier) || reservedTypeScriptWords.has(identifier)) return `_${identifier}`
  return identifier
}
