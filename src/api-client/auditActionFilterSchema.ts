import * as v from "valibot"

import { auditActionCatalog } from "../audit/auditActionCatalog.js"

const auditActionFilterValuesValid = (value: string): boolean =>
  value.split(",").every((action) => auditActionCatalog.some((knownAction) => knownAction === action))

export const auditActionFilterSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.check(auditActionFilterValuesValid),
)
