import * as v from "valibot"

const r2PrefixValid = (value: string): boolean => {
  const normalized = value.replace(/^\/+|\/+$/g, "")
  if (normalized.length === 0) return true
  return (
    !normalized.includes("\\") &&
    !/\p{Cc}/u.test(normalized) &&
    !normalized.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  )
}

export const r2PrefixSchema = v.pipe(
  v.string(),
  v.check(r2PrefixValid, "R2 prefix must be a relative, non-empty prefix"),
)

export type R2Prefix = v.InferOutput<typeof r2PrefixSchema>
