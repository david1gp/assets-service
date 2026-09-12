import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"
import {
  type ZitadelOrganizationMapping,
  zitadelOrganizationMappingSchema,
} from "./zitadelOrganizationMappingSchema.js"

export const zitadelAuthConfigSchema = v.pipe(
  v.strictObject({
    issuer: v.pipe(v.string(), v.url()),
    clientId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
    serviceAccountClientId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
    projectProvisionerSubjectId: v.optional(idSchema),
    projectProvisionerSubjectIds: v.optional(v.array(idSchema)),
    redirectUri: v.pipe(v.string(), v.url()),
    audience: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
    organizationId: idSchema,
    customerOrganizationId: idSchema,
    organizationMappings: v.optional(v.array(zitadelOrganizationMappingSchema)),
    projectId: idSchema,
    sessionCookieName: v.pipe(v.string(), v.regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)),
    stateCookieName: v.pipe(v.string(), v.regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)),
    sessionTtlSeconds: v.pipe(v.number(), v.integer(), v.minValue(60), v.maxValue(86400 * 30)),
    sessionRotationSeconds: v.pipe(v.number(), v.integer(), v.minValue(60), v.maxValue(86400)),
    clockSkewSeconds: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(300)),
    jwksCacheTtlSeconds: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(86400)),
  }),
  v.check(
    (config) => config.organizationId !== config.customerOrganizationId,
    "ZITADEL_ORGANIZATION_ID and ZITADEL_CUSTOMER_ORGANIZATION_ID must be different",
  ),
  v.check((config) => {
    const defaultMapping: ZitadelOrganizationMapping = {
      ownerOrganizationId: config.organizationId,
      customerOrganizationId: config.customerOrganizationId,
    }
    const mappings = config.organizationMappings ?? [defaultMapping]
    const owners = new Set<string>()
    const customers = new Set<string>()
    for (const mapping of mappings) {
      if (owners.has(mapping.ownerOrganizationId)) return false
      owners.add(mapping.ownerOrganizationId)
      if (mapping.customerOrganizationId) {
        if (customers.has(mapping.customerOrganizationId)) return false
        customers.add(mapping.customerOrganizationId)
      }
    }
    for (const owner of owners) {
      if (customers.has(owner)) return false
    }
    return true
  }, "organizationMappings must have unique owners, unique customers, and disjoint owner/customer sets"),
  v.transform((config) => {
    const defaultMapping: ZitadelOrganizationMapping = {
      ownerOrganizationId: config.organizationId,
      customerOrganizationId: config.customerOrganizationId,
    }
    const hasDefaultOwner = config.organizationMappings?.some(
      (mapping) => mapping.ownerOrganizationId === config.organizationId,
    )
    const organizationMappings = config.organizationMappings
      ? hasDefaultOwner
        ? config.organizationMappings
        : [defaultMapping, ...config.organizationMappings]
      : [defaultMapping]
    return {
      ...config,
      organizationMappings,
    }
  }),
)

export type ZitadelAuthConfig = Omit<v.InferOutput<typeof zitadelAuthConfigSchema>, "organizationMappings"> & {
  organizationMappings?: readonly ZitadelOrganizationMapping[]
}
