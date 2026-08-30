import * as v from "valibot"

export const organizationDefinitionSchema = v.strictObject({
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  slug: v.pipe(v.string(), v.slug()),
})

export type OrganizationDefinition = v.InferOutput<typeof organizationDefinitionSchema>
