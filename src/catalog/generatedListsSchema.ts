import * as v from "valibot"

import { sha256Schema } from "../schemas/sha256Schema.js"

export const generatedListsSchema = v.strictObject({
  imageList: v.string(),
  videoList: v.string(),
  fontList: v.string(),
  documentList: v.string(),
  digest: sha256Schema,
})

export type GeneratedLists = v.InferOutput<typeof generatedListsSchema>
