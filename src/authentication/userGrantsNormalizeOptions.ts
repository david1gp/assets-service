import type { AuthenticationRole } from "./authenticationRoleSchema.js"

export type UserGrantsNormalizeOptions = {
  organizationId?: string
  allowedOrganizationIds?: readonly string[]
  allowedRoles?: readonly AuthenticationRole[]
}
