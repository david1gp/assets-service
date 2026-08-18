import * as v from "valibot"

import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { type AuthenticatedPrincipal, authenticatedPrincipalSchema } from "./authenticatedPrincipalSchema.js"
import { authenticationRoleSchema } from "./authenticationRoleSchema.js"
import { servicePatGrantSearchResponseSchema } from "./servicePatGrantSearchResponseSchema.js"
import type { ServicePatPrincipalValidateOptions } from "./servicePatPrincipalValidateOptions.js"
import { servicePatUserResponseSchema } from "./servicePatUserResponseSchema.js"

const jsonBodyRead = async (response: Response, op: string): Promise<Result<unknown>> => {
  try {
    return { success: true, data: await response.json() }
  } catch (error) {
    return resultErrorCreate(op, "The Zitadel response was not valid JSON", error)
  }
}

const issuerUrlCreate = (issuer: string, path: string): Result<string> => {
  try {
    const base = issuer.endsWith("/") ? issuer : `${issuer}/`
    return { success: true, data: new URL(path, base).toString() }
  } catch (error) {
    return resultErrorCreate("servicePatPrincipalValidate", "The configured issuer URL was invalid", error)
  }
}

export const servicePatPrincipalValidate = async (
  token: string,
  options: ServicePatPrincipalValidateOptions,
): Promise<Result<AuthenticatedPrincipal>> => {
  const op = "servicePatPrincipalValidate"
  const fetcher = options.fetcher ?? fetch
  const userUrl = issuerUrlCreate(options.issuer, "auth/v1/users/me")
  if (!userUrl.success) return userUrl
  const grantsUrl = issuerUrlCreate(options.issuer, "auth/v1/usergrants/me/_search")
  if (!grantsUrl.success) return grantsUrl

  let userResponse: Response
  try {
    userResponse = await fetcher(userUrl.data, {
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    })
  } catch (error) {
    return resultErrorCreate(op, "Unable to reach the Zitadel user endpoint", error, { retryable: true })
  }
  if (!userResponse.ok) return resultErrorCreate(op, "The Zitadel personal access token was invalid")
  const userBody = await jsonBodyRead(userResponse, op)
  if (!userBody.success) return userBody
  const user = v.safeParse(servicePatUserResponseSchema, userBody.data)
  if (!user.success) return resultErrorCreate(op, "The Zitadel user response was invalid")
  if (user.output.user.details.resourceOwner !== options.organizationId)
    return resultErrorCreate(op, "The JWT organization was invalid")

  let grantsResponse: Response
  try {
    grantsResponse = await fetcher(grantsUrl.data, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: "{}",
    })
  } catch (error) {
    return resultErrorCreate(op, "Unable to reach the Zitadel grant endpoint", error, { retryable: true })
  }
  if (!grantsResponse.ok) return resultErrorCreate(op, "The Zitadel grant lookup failed", undefined, { retryable: true })
  const grantsBody = await jsonBodyRead(grantsResponse, op)
  if (!grantsBody.success) return grantsBody
  const grantsParsed = v.safeParse(servicePatGrantSearchResponseSchema, grantsBody.data)
  if (!grantsParsed.success) return resultErrorCreate(op, "The Zitadel grant response was invalid")

  const grants = []
  for (const grant of grantsParsed.output.result ?? []) {
    if (grant.state !== undefined && grant.state !== "USER_GRANT_STATE_ACTIVE") continue
    if (grant.orgId !== undefined && grant.orgId !== options.organizationId) continue
    const roleKeys = [...(grant.roleKeys ?? []), ...(grant.roles ?? [])]
    const roles = [
      ...new Set(
        roleKeys.filter((role): role is "assets.admin" | "assets.uploader" =>
          v.is(authenticationRoleSchema, role),
        ),
      ),
    ].sort()
    if (roles.length === 0) continue
    grants.push({ projectId: grant.projectId, roles })
  }
  if (grants.length === 0) return resultErrorCreate(op, "The JWT did not contain the required project grant")
  if (options.projectId !== undefined && !grants.some((grant) => grant.projectId === options.projectId))
    return resultErrorCreate(op, "The JWT did not contain the required project grant")

  const now = Math.floor((options.now ?? (() => Date.now()))() / 1000)
  const validated = v.safeParse(authenticatedPrincipalSchema, {
    subjectId: user.output.user.id,
    organizationId: user.output.user.details.resourceOwner,
    method: "service_account",
    grants,
    issuedAt: now,
    expiresAt: now + 300,
  })
  if (!validated.success) return resultErrorCreate(op, "The personal access token principal was invalid")
  return { success: true, data: validated.output }
}
