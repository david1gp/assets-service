import * as v from "valibot"

const projectSourceDirectorySchema = v.nullable(v.pipe(v.string(), v.minLength(1)))

export const projectSourceConfigurationInputSchema = v.strictObject({
  image: v.optional(projectSourceDirectorySchema),
  video: v.optional(projectSourceDirectorySchema),
  document: v.optional(projectSourceDirectorySchema),
  font: v.optional(projectSourceDirectorySchema),
})

export type ProjectSourceConfigurationInput = v.InferOutput<typeof projectSourceConfigurationInputSchema>
