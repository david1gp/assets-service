import * as v from "valibot"

export const storageNamespaceSchema = v.picklist(["private-staging", "private-source", "public-output"])

export type StorageNamespace = v.InferOutput<typeof storageNamespaceSchema>
