import { expect, test } from "bun:test"

import { zitadelAuthConfigRead } from "../src/config/zitadelAuthConfigRead.js"

const environment = {
  ZITADEL_ISSUER: "https://zitadel.example.test",
  ZITADEL_CLIENT_ID: "human-client-1",
  ZITADEL_REDIRECT_URI: "https://assets.example.test/auth/callback",
  ZITADEL_AUDIENCE: "assets-api",
  ZITADEL_ORGANIZATION_ID: "org-contentoren",
  ZITADEL_CUSTOMER_ORGANIZATION_ID: "org-contentoren-customers",
  ZITADEL_PROJECT_ID: "zitadel-project-1",
}

test("requires and reads the configured customer organization", () => {
  const result = zitadelAuthConfigRead(environment)
  expect(result).toMatchObject({
    success: true,
    data: {
      organizationId: "org-contentoren",
      customerOrganizationId: "org-contentoren-customers",
    },
  })

  expect(zitadelAuthConfigRead({ ...environment, ZITADEL_CUSTOMER_ORGANIZATION_ID: undefined }).success).toBe(false)
})

test("rejects using the staff organization as the customer organization", () => {
  const result = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_CUSTOMER_ORGANIZATION_ID: environment.ZITADEL_ORGANIZATION_ID,
  })

  expect(result).toMatchObject({
    success: false,
    op: "zitadelAuthConfigRead",
  })
  if (result.success) return
  expect(result.errorMessage).toContain(
    "ZITADEL_ORGANIZATION_ID and ZITADEL_CUSTOMER_ORGANIZATION_ID must be different",
  )
})

test("reads the optional project provisioner subject ID when configured", () => {
  const unset = zitadelAuthConfigRead(environment)
  expect(unset.success).toBe(true)
  if (unset.success) expect(unset.data.projectProvisionerSubjectId).toBeUndefined()

  const set = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_PROJECT_PROVISIONER_SUBJECT_ID: "machine-provisioner-1",
  })
  expect(set).toMatchObject({
    success: true,
    data: {
      projectProvisionerSubjectId: "machine-provisioner-1",
    },
  })

  const invalid = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_PROJECT_PROVISIONER_SUBJECT_ID: "-invalid-id",
  })
  expect(invalid.success).toBe(false)
})

test("defaults organizationMappings from ZITADEL_ORGANIZATION_ID and ZITADEL_CUSTOMER_ORGANIZATION_ID when omitted", () => {
  const result = zitadelAuthConfigRead(environment)
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.organizationMappings).toEqual([
    {
      ownerOrganizationId: "org-contentoren",
      customerOrganizationId: "org-contentoren-customers",
    },
  ])
})

test("reads multi-org mappings from ZITADEL_ORGANIZATION_MAPPINGS JSON array", () => {
  const mappings = [
    { ownerOrganizationId: "org-contentoren", customerOrganizationId: "org-contentoren-customers" },
    { ownerOrganizationId: "org-fabian", customerOrganizationId: "org-fabian-customers" },
    { ownerOrganizationId: "org-david" },
  ]
  const result = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_ORGANIZATION_MAPPINGS: JSON.stringify(mappings),
  })
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.organizationMappings).toEqual(mappings)
})

test("reads multi-org mappings from ZITADEL_ORGANIZATION_MAPPINGS JSON object record", () => {
  const mappingsRecord = {
    "org-contentoren": "org-contentoren-customers",
    "org-fabian": "org-fabian-customers",
    "org-david": null,
  }
  const result = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_ORGANIZATION_MAPPINGS: JSON.stringify(mappingsRecord),
  })
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.organizationMappings).toEqual([
    { ownerOrganizationId: "org-contentoren", customerOrganizationId: "org-contentoren-customers" },
    { ownerOrganizationId: "org-fabian", customerOrganizationId: "org-fabian-customers" },
    { ownerOrganizationId: "org-david" },
  ])
})

test("rejects invalid JSON in ZITADEL_ORGANIZATION_MAPPINGS", () => {
  const result = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_ORGANIZATION_MAPPINGS: "{invalid",
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("organization mappings JSON was invalid")
})

test("rejects duplicate owner in ZITADEL_ORGANIZATION_MAPPINGS", () => {
  const result = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_ORGANIZATION_MAPPINGS: JSON.stringify([
      { ownerOrganizationId: "org-1", customerOrganizationId: "org-c1" },
      { ownerOrganizationId: "org-1", customerOrganizationId: "org-c2" },
    ]),
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("Duplicate owner organization")
})

test("rejects duplicate customer in ZITADEL_ORGANIZATION_MAPPINGS", () => {
  const result = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_ORGANIZATION_MAPPINGS: JSON.stringify([
      { ownerOrganizationId: "org-1", customerOrganizationId: "org-customer" },
      { ownerOrganizationId: "org-2", customerOrganizationId: "org-customer" },
    ]),
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("Duplicate customer organization")
})

test("rejects organization configured as both owner and customer", () => {
  const result = zitadelAuthConfigRead({
    ...environment,
    ZITADEL_ORGANIZATION_MAPPINGS: JSON.stringify([
      { ownerOrganizationId: "org-shared", customerOrganizationId: "org-c1" },
      { ownerOrganizationId: "org-2", customerOrganizationId: "org-shared" },
    ]),
  })
  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("cannot be both owner and customer")
})
