import * as v from "valibot"

export const legacyImportConflictSchema = v.strictObject({
  path: v.pipe(v.string(), v.minLength(1)),
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  message: v.pipe(v.string(), v.minLength(1)),
  candidates: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
})

export type LegacyImportConflict = v.InferOutput<typeof legacyImportConflictSchema>
