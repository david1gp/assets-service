import * as v from "valibot"

const projectSourceDirectorySchema = v.nullable(v.pipe(v.string(), v.minLength(1)))

export const projectSourceConfigurationSchema = v.strictObject({
  image: projectSourceDirectorySchema,
  video: projectSourceDirectorySchema,
  document: projectSourceDirectorySchema,
  font: projectSourceDirectorySchema,
})

export type ProjectSourceConfiguration = v.InferOutput<typeof projectSourceConfigurationSchema>
