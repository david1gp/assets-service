import type { ZitadelOrganizationContext } from "./zitadelOrganizationContext.js"
import type { ZitadelOrganizationMapping } from "./zitadelOrganizationMappingSchema.js"

export const zitadelOrganizationContextCreate = (
  mappings: readonly ZitadelOrganizationMapping[],
): ZitadelOrganizationContext => {
  const ownerOrganizationIds = [...new Set(mappings.map((mapping) => mapping.ownerOrganizationId))]
  const customerOrganizationIds = [
    ...new Set(
      mappings
        .map((mapping) => mapping.customerOrganizationId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ]
  const allowedOrganizationIds = [...new Set([...ownerOrganizationIds, ...customerOrganizationIds])]
  const ownerByCustomer = new Map<string, string>()
  const customerByOwner = new Map<string, string>()
  for (const mapping of mappings) {
    if (mapping.customerOrganizationId) {
      ownerByCustomer.set(mapping.customerOrganizationId, mapping.ownerOrganizationId)
      customerByOwner.set(mapping.ownerOrganizationId, mapping.customerOrganizationId)
    }
  }

  return {
    mappings,
    ownerOrganizationIds,
    customerOrganizationIds,
    allowedOrganizationIds,
    isOwner: (organizationId: string) => ownerOrganizationIds.includes(organizationId),
    isCustomer: (organizationId: string) => customerOrganizationIds.includes(organizationId),
    ownerForCustomerRead: (customerOrganizationId: string) => ownerByCustomer.get(customerOrganizationId) ?? null,
    customerForOwnerRead: (ownerOrganizationId: string) => customerByOwner.get(ownerOrganizationId) ?? null,
  }
}
