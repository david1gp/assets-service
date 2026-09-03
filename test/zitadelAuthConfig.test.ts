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
