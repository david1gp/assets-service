import type { ZitadelOidcClient } from "../infrastructure/zitadel/zitadelOidcClient.js"
import type { ZitadelUserGrant } from "../infrastructure/zitadel/zitadelUserGrantSchema.js"
import type { ProjectRepository } from "../project/projectRepository.js"
import { resultErrorCreate } from "../schemas/resultErrorCreate.js"
import type { Result } from "../schemas/resultSchema.js"
import { jwtProjectGrantsRead } from "./jwtProjectGrantsRead.js"
import { jwtTokenParse } from "./jwtTokenParse.js"
import type { ProjectGrant } from "./projectGrantSchema.js"
import type { SessionAccessTokenStore } from "./sessionAccessTokenStore.js"
import type { SessionOrganizationItem, SessionOrganizationsReadResponse } from "./sessionOrganizationItemSchema.js"
import type { AuthenticationSession } from "./sessionSchema.js"
import { userGrantsNormalize } from "./userGrantsNormalize.js"
import type { ZitadelAuthConfig } from "./zitadelAuthConfigSchema.js"
import { zitadelOrganizationContextCreate } from "./zitadelOrganizationContextCreate.js"

type SessionOrganizationsReadOptions = {
  config: ZitadelAuthConfig
  oidcClient: ZitadelOidcClient
  projectRepository?: ProjectRepository
  sessionAccessTokenStore: SessionAccessTokenStore
  now?: () => number
}

export const sessionOrganizationsRead = async (
  session: AuthenticationSession,
  options: SessionOrganizationsReadOptions,
): Promise<Result<SessionOrganizationsReadResponse>> => {
  const op = "sessionOrganizationsRead"
  const orgContext = zitadelOrganizationContextCreate(
    options.config.organizationMappings ?? [
      {
        ownerOrganizationId: options.config.organizationId,
        customerOrganizationId: options.config.customerOrganizationId,
      },
    ],
  )
  const currentOrgId = session.principal.organizationId
  const organizations: SessionOrganizationItem[] = []

  let jwtClaims: Record<string, unknown> | undefined
  let accessToken: string | undefined
  if (session.accessTokenReference) {
    const stored = options.sessionAccessTokenStore.read(
      session.accessTokenReference,
      Math.floor((options.now ?? (() => Date.now()))() / 1000),
    )
    if (stored.success) accessToken = stored.data ?? undefined
  }
  if (accessToken) {
    const parsed = await jwtTokenParse(accessToken)
    if (parsed.success) jwtClaims = parsed.data.payload
  }

  let discoveredUserGrants: readonly ZitadelUserGrant[] | undefined
  if (accessToken && options.oidcClient.userGrantsRead !== undefined) {
    const grantsResult = await options.oidcClient.userGrantsRead(accessToken)
    if (!grantsResult.success) return grantsResult
    discoveredUserGrants = grantsResult.data
  }

  for (const orgId of orgContext.allowedOrganizationIds) {
    let isMember = false
    let isAdmin = false
    let displayName: string | undefined

    if (accessToken) {
      const membership = await options.oidcClient.organizationMembershipRead(accessToken, orgId)
      if (membership.success && membership.data.isExactMember) {
        isMember = true
        isAdmin = Boolean(membership.data.isOrganizationAdmin)
        displayName = membership.data.displayName
      }
    } else if (orgId === currentOrgId) {
      isMember = true
      isAdmin = Boolean(session.principal.organizationAdmin)
    }

    if (!isMember) continue

    const isOwner = orgContext.isOwner(orgId)
    const isCustomer = orgContext.isCustomer(orgId)
    const mode = isOwner ? "admin" : "contributor"
    const organizationAdmin = isOwner && isAdmin

    if (isCustomer) {
      const candidateGrants =
        discoveredUserGrants !== undefined
          ? userGrantsNormalize(discoveredUserGrants, {
              organizationId: orgId,
              allowedRoles: ["contributor"],
            })
          : orgId === session.identityOrganizationId
            ? (session.identityGrants ?? session.principal.grants)
            : jwtClaims
              ? jwtProjectGrantsRead(jwtClaims, orgId, options.config.projectId)
              : []
      const projectOrganizationId = orgContext.ownerForCustomerRead(orgId) ?? orgId
      const projectIds = options.projectRepository?.projectGrantIdsRead?.(projectOrganizationId)
      if (projectIds === undefined || !projectIds.success) continue
      const allowedProjectIds = new Set(projectIds.data)
      const contributorGrants = candidateGrants
        .map((grant) => ({ ...grant, roles: grant.roles.filter((role) => role === "contributor") }))
        .filter((grant) => allowedProjectIds.has(grant.projectId))
        .filter((grant) => grant.roles.length > 0)
      if (contributorGrants.length === 0) continue
    }

    const repoOrg = options.projectRepository?.organizationRead(orgId)
    const repoName = repoOrg && repoOrg.success && repoOrg.data ? repoOrg.data.name : undefined
    const name = displayName ?? repoName ?? orgId

    organizations.push({
      id: orgId,
      name,
      ...(repoOrg?.success && repoOrg.data ? { slug: repoOrg.data.slug } : {}),
      current: orgId === currentOrgId,
      mode,
      organizationAdmin,
    })
  }

  return {
    success: true,
    data: {
      organizations,
      currentOrganizationId: currentOrgId,
    },
  }
}
