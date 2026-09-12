import * as v from "valibot"

const r2CustomDomainValid = (value: string): boolean =>
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value)

export const r2CustomDomainSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(253),
  v.check(r2CustomDomainValid, "The custom domain must be a lowercase hostname"),
)

export type R2CustomDomain = v.InferOutput<typeof r2CustomDomainSchema>
