import * as v from "valibot"

import { outputObjectKeySchema } from "../output/outputObjectKeySchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

export const storagePublicObjectKeyValidate = (key: string): Result<true> => {
  const op = "storagePublicObjectKeyValidate"
  const parsed = v.safeParse(outputObjectKeySchema, key)
  if (!parsed.success) return resultErrorCreate(op, "Public output key is invalid", key)
  const filename = parsed.output.split("/").at(-1)
  if (!filename || !/(?:_v[1-9][0-9]*|_[0-9a-f]{8})\.[^./]+$/u.test(filename)) {
    return resultErrorCreate(op, "Public output keys must end with a version or content hash")
  }
  return { success: true, data: true }
}
