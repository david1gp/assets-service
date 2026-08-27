import * as v from "valibot"

import { type Environment, environmentSchema } from "../project/environmentSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type StorageBinding, storageBindingSchema } from "./storageBindingSchema.js"

export const storageBindingResolve = (
  environment: Environment,
  projectId = environment.projectId,
): Result<StorageBinding> => {
  const op = "storageBindingResolve"
  const parsed = v.safeParse(environmentSchema, environment)
  if (!parsed.success) return resultErrorCreate(op, v.summarize(parsed.issues), environment)
  if (parsed.output.projectId !== projectId) return resultErrorCreate(op, "Environment is bound to a different project")

  const prefix = parsed.output.r2Prefix.replace(/^\/+|\/+$/g, "")
  if (
    prefix.length > 0 &&
    (prefix.startsWith("/") ||
      prefix.includes("\\") ||
      /\p{Cc}/u.test(prefix) ||
      prefix.split("/").some((segment) => segment.length === 0 || segment === "." || segment === ".."))
  ) {
    return resultErrorCreate(op, "R2 prefix must be a relative, non-empty prefix")
  }

  const binding = {
    projectId,
    environment: parsed.output.name,
    bucket: parsed.output.r2Bucket,
    prefix,
    publicBaseUrl: parsed.output.publicBaseUrl.replace(/\/+$/, ""),
  }
  const parsedBinding = v.safeParse(storageBindingSchema, binding)
  if (!parsedBinding.success) return resultErrorCreate(op, v.summarize(parsedBinding.issues), binding)
  return {
    success: true,
    data: parsedBinding.output,
  }
}
