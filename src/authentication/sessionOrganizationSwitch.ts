import type { ProjectRepository } from "../project/projectRepository.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import type { ZitadelOidcClient } from "../infrastructure/zitadel/zitadelOidcClient.js"
import type { AuthenticationMode } from "./authenticationModeSchema.js"
import { jwtProjectGrantsRead } from "./jwtProjectGrantsRead.js"
import { jwtTokenParse } from "./jwtTokenParse.js"
import type { ProjectGrant } from "./projectGrantSchema.js"
import type { AuthenticationSession } from "./sessionSchema.js"
import type { ZitadelAuthConfig } from "./zitadelAuthConfigSchema.js"
import type { SessionAccessTokenStore } from "./sessionAccessTokenStore.js"
import { userGrantsNormalize } from "./userGrantsNormalize.js"
import { zitadelOrganizationContextCreate } from "./zitadelOrganizationContextCreate.js"

type SessionOrganizationSwitchOptions = {
  config: ZitadelAuthConfig
  oidcClient: ZitadelOidcClient
  projectRepository?: ProjectRepository
  sessionAccessTokenStore: SessionAccessTokenStore
  now?: () => number
}

export const sessionOrganizationSwitch = async (
  session: AuthenticationSession,
  targetOrganizationId: string,
  options: SessionOrganizationSwitchOptions,
): Promise<Result<AuthenticationSession>> => {
  const op = "sessionOrganizationSwitch"
  const orgContext = zitadelOrganizationContextCreate(
    options.config.organizationMappings ?? [
      {
        ownerOrganizationId: options.config.organizationId,
        customerOrganizationId: options.config.customerOrganizationId,
      },
    ],
  )
  if (!orgContext.allowedOrganizationIds.includes(targetOrganizationId)) {
    return resultErrorCreate(op, "The organization was not allowed")
  }
  if (!session.accessTokenReference) {
    return resultErrorCreate(op, "The authenticated session token was missing")
  }
  const accessTokenResult = options.sessionAccessTokenStore.read(
    session.accessTokenReference,
    Math.floor((options.now ?? (() => Date.now()))() / 1000),
  )
  if (!accessTokenResult.success) return accessTokenResult
  if (!accessTokenResult.data) return resultErrorCreate(op, "The authenticated session token was missing")
  const accessToken = accessTokenResult.data

  const membership = await options.oidcClient.organizationMembershipRead(accessToken, targetOrganizationId)
  if (!membership.success) return membership
  if (!membership.data.isExactMember) {
    return resultErrorCreate(op, "The user is not a member of the requested organization")
  }

  const isOwner = orgContext.isOwner(targetOrganizationId)
  const isCustomer = orgContext.isCustomer(targetOrganizationId)
  const mode: AuthenticationMode = isOwner ? "admin" : "contributor"
  const organizationAdmin = isOwner && Boolean(membership.data.isOrganizationAdmin)

  const originalOrgId = session.identityOrganizationId ?? session.principal.organizationId
  const isReturningToOriginal = targetOrganizationId === originalOrgId

  let grants: ProjectGrant[]
  if (options.oidcClient.userGrantsRead !== undefined) {
    const userGrantsResult = await options.oidcClient.userGrantsRead(accessToken)
    if (!userGrantsResult.success) return userGrantsResult
    grants = userGrantsNormalize(userGrantsResult.data, {
      organizationId: targetOrganizationId,
      allowedRoles: isCustomer ? ["contributor"] : undefined,
    })
  } else if (isReturningToOriginal) {
    grants = session.identityGrants ?? []
  } else {
    const parsedJwt = await jwtTokenParse(accessToken)
    grants = parsedJwt.success
      ? jwtProjectGrantsRead(parsedJwt.data.payload, targetOrganizationId, options.config.projectId)
      : []
  }

  if (isCustomer) {
    grants = grants
      .map((grant) => ({ ...grant, roles: grant.roles.filter((role) => role === "contributor") }))
      .filter((grant) => grant.roles.length > 0)
    if (grants.length === 0) {
      return resultErrorCreate(op, "The JWT did not contain the required project grant")
    }
  }

  const projectOrganizationId = isCustomer
    ? (orgContext.ownerForCustomerRead(targetOrganizationId) ?? targetOrganizationId)
    : targetOrganizationId
  if (options.projectRepository?.projectGrantIdsRead !== undefined && grants.length > 0) {
    const projectIds = options.projectRepository.projectGrantIdsRead(projectOrganizationId)
    if (!projectIds.success) return projectIds
    const allowedProjectIds = new Set(projectIds.data)
    grants = grants.filter((grant) => allowedProjectIds.has(grant.projectId))
    if (isCustomer && grants.length === 0) {
      return resultErrorCreate(op, "The JWT did not contain the required project grant")
    }
  } else if (isCustomer) {
    return resultErrorCreate(op, "The organization project bindings were unavailable")
  }

  const updatedSession: AuthenticationSession = {
    ...session,
    principal: {
      ...session.principal,
      organizationId: targetOrganizationId,
      mode,
      organizationAdmin,
      grants,
    },
    identityOrganizationId: originalOrgId,
    identityGrants: session.identityGrants ?? session.principal.grants,
    accessTokenReference: session.accessTokenReference,
  }

  return { success: true, data: updatedSession }
}
