import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { catalogEntryPropertyCreate } from "./catalogEntryPropertyCreate.js"
import { type CatalogEntry, catalogEntrySchema } from "./catalogEntrySchema.js"

const catalogEntryPathValidate = (path: string): string | undefined => {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.includes("\\")) return "path must be relative"
  if ([...path].some((character) => /\p{Cc}/u.test(character))) {
    return "path contains a control character"
  }

  const segments = path.split("/")
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return "path contains an invalid segment"
  }

  return undefined
}

const catalogEntryNormalize = (entry: CatalogEntry): CatalogEntry => {
  if (entry.class === "font") {
    return {
      ...entry,
      folders: entry.folders.map((folder) => folder.normalize("NFC")),
      basename: entry.basename.normalize("NFC"),
      key: entry.key.normalize("NFC"),
      path: entry.path.normalize("NFC"),
      metadata: {
        ...entry.metadata,
        variableAxes: entry.metadata.variableAxes.toSorted(),
        unicodeRanges: entry.metadata.unicodeRanges.toSorted(),
      },
    }
  }

  return {
    ...entry,
    folders: entry.folders.map((folder) => folder.normalize("NFC")),
    basename: entry.basename.normalize("NFC"),
    key: entry.key.normalize("NFC"),
    path: entry.path.normalize("NFC"),
  }
}

export const catalogEntriesCanonicalize = (entries: readonly unknown[]): Result<readonly CatalogEntry[]> => {
  const op = "catalogEntriesCanonicalize"
  const canonicalEntries: CatalogEntry[] = []
  const propertiesByClass = new Map<CatalogEntry["class"], Map<string, number>>()

  for (const [index, entry] of entries.entries()) {
    const parsed = v.safeParse(catalogEntrySchema, entry)
    if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), { index, entry })

    const pathError = catalogEntryPathValidate(parsed.output.path)
    if (pathError) return resultErrorCreate(op, pathError, { index, entry })

    const canonicalEntry = catalogEntryNormalize(parsed.output)
    const property = catalogEntryPropertyCreate(canonicalEntry)
    const properties = propertiesByClass.get(canonicalEntry.class) ?? new Map<string, number>()
    const previousIndex = properties.get(property)
    if (previousIndex !== undefined) {
      return resultErrorCreate(op, `generated property collision: ${property}`, { index, previousIndex, property })
    }

    properties.set(property, index)
    propertiesByClass.set(canonicalEntry.class, properties)
    canonicalEntries.push(canonicalEntry)
  }

  canonicalEntries.sort((left, right) => {
    const leftProperty = catalogEntryPropertyCreate(left)
    const rightProperty = catalogEntryPropertyCreate(right)
    if (leftProperty !== rightProperty) return leftProperty < rightProperty ? -1 : 1
    return left.class < right.class ? -1 : left.class > right.class ? 1 : 0
  })
  return { success: true, data: canonicalEntries }
}
