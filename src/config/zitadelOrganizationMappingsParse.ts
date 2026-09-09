import * as v from "valibot"

import {
  type ZitadelOrganizationMapping,
  zitadelOrganizationMappingSchema,
} from "../authentication/zitadelOrganizationMappingSchema.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)

export const zitadelOrganizationMappingsParse = (value: unknown): Result<readonly ZitadelOrganizationMapping[]> => {
  const op = "zitadelOrganizationMappingsParse"
  let parsedJson: unknown = value
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0) return { success: true, data: [] }
    try {
      parsedJson = JSON.parse(trimmed)
    } catch (error) {
      return resultErrorCreate(op, "The organization mappings JSON was invalid", error)
    }
  }

  let rawList: unknown[]
  if (Array.isArray(parsedJson)) {
    rawList = parsedJson
  } else if (isRecord(parsedJson)) {
    rawList = Object.entries(parsedJson).map(([ownerOrganizationId, customerOrganizationId]) => ({
      ownerOrganizationId,
      customerOrganizationId,
    }))
  } else {
    return resultErrorCreate(op, "The organization mappings must be a JSON array or object")
  }

  const mappings: ZitadelOrganizationMapping[] = []
  const owners = new Set<string>()
  const customers = new Set<string>()

  for (const item of rawList) {
    const parsedItem = v.safeParse(zitadelOrganizationMappingSchema, item)
    if (!parsedItem.success)
      return resultErrorCreate(op, `The organization mapping was invalid: ${v.summarize(parsedItem.issues)}`)
    const mapping = parsedItem.output
    if (owners.has(mapping.ownerOrganizationId))
      return resultErrorCreate(op, `Duplicate owner organization configured: ${mapping.ownerOrganizationId}`)
    owners.add(mapping.ownerOrganizationId)
    if (mapping.customerOrganizationId) {
      if (customers.has(mapping.customerOrganizationId))
        return resultErrorCreate(op, `Duplicate customer organization configured: ${mapping.customerOrganizationId}`)
      customers.add(mapping.customerOrganizationId)
    }
    mappings.push(mapping)
  }

  for (const owner of owners) {
    if (customers.has(owner)) return resultErrorCreate(op, `Organization cannot be both owner and customer: ${owner}`)
  }

  return { success: true, data: mappings }
}
