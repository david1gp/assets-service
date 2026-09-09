import type { ZitadelOrganizationMapping } from "./zitadelOrganizationMappingSchema.js"

export type ZitadelOrganizationContext = {
  readonly mappings: readonly ZitadelOrganizationMapping[]
  readonly ownerOrganizationIds: readonly string[]
  readonly customerOrganizationIds: readonly string[]
  readonly allowedOrganizationIds: readonly string[]
  isOwner: (organizationId: string) => boolean
  isCustomer: (organizationId: string) => boolean
  ownerForCustomerRead: (customerOrganizationId: string) => string | null
  customerForOwnerRead: (ownerOrganizationId: string) => string | null
}
