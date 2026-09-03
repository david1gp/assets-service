import * as v from "valibot"

import { idSchema } from "../schemas/idSchema.js"

export const zitadelAuthConfigSchema = v.pipe(
  v.strictObject({
    issuer: v.pipe(v.string(), v.url()),
    clientId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
    serviceAccountClientId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
    redirectUri: v.pipe(v.string(), v.url()),
    audience: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
    organizationId: idSchema,
    customerOrganizationId: idSchema,
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
)

export type ZitadelAuthConfig = v.InferOutput<typeof zitadelAuthConfigSchema>
