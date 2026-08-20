import { expect, test } from "bun:test"
import * as v from "valibot"

import { zitadelOidcDiscoverySchema } from "../src/infrastructure/zitadel/zitadelOidcDiscoverySchema.js"

test("Zitadel OIDC discovery accepts standard extra fields", () => {
  const discovery = {
    issuer: "https://zitadel.example.test",
    authorization_endpoint: "https://zitadel.example.test/oauth/v2/authorize",
    token_endpoint: "https://zitadel.example.test/oauth/v2/token",
    jwks_uri: "https://zitadel.example.test/oauth/v2/keys",
    introspection_endpoint: "https://zitadel.example.test/oauth/v2/introspect",
  }

  const accepted = v.safeParse(zitadelOidcDiscoverySchema, discovery)
  expect(accepted.success).toBe(true)
  expect(accepted.success && accepted.output.introspection_endpoint).toBe(discovery.introspection_endpoint)

  expect(v.safeParse(zitadelOidcDiscoverySchema, { ...discovery, jwks_uri: "not-a-url" }).success).toBe(false)
})
