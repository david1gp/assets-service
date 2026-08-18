import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type StorageBinding, storageBindingSchema } from "./storageBindingSchema.js"
import { type StorageNamespace, storageNamespaceSchema } from "./storageNamespaceSchema.js"
import type { StorageObjectLocation } from "./storageObjectLocation.js"

const namespaceRoots: Record<StorageNamespace, string> = {
  "private-staging": "private/staging",
  "private-source": "private/source",
  "public-output": "public",
}

export const storageObjectLocationCreate = (
  binding: StorageBinding,
  namespace: StorageNamespace,
  key: string,
): Result<StorageObjectLocation & { bucket: string; objectKey: string }> => {
  const op = "storageObjectLocationCreate"
  const parsedNamespace = v.safeParse(storageNamespaceSchema, namespace)
  if (!parsedNamespace.success) return resultErrorCreate(op, v.summarize(parsedNamespace.issues), namespace)
  const parsedBinding = v.safeParse(storageBindingSchema, binding)
  if (!parsedBinding.success) return resultErrorCreate(op, v.summarize(parsedBinding.issues), binding)
  if (typeof key !== "string") return resultErrorCreate(op, "Storage object key must be a string", key)
  const normalizedKey = key.normalize("NFC")
  if (
    normalizedKey.length === 0 ||
    normalizedKey.startsWith("/") ||
    normalizedKey.includes("\\") ||
    /\p{Cc}/u.test(normalizedKey) ||
    normalizedKey.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    return resultErrorCreate(op, "Storage object key must be a relative path without traversal")
  }

  const objectKey = `${parsedBinding.output.prefix}/${namespaceRoots[parsedNamespace.output]}/${normalizedKey}`
  return {
    success: true,
    data: {
      binding: parsedBinding.output,
      namespace: parsedNamespace.output,
      key: normalizedKey,
      bucket: parsedBinding.output.bucket,
      objectKey,
    },
  }
}
