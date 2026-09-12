import { expect, test } from "bun:test"

import { cloudflareR2BucketCredentialCreate } from "../src/cloudflare/cloudflareR2BucketCredentialCreate.js"
import { cloudflareR2BucketCredentialRevoke } from "../src/cloudflare/cloudflareR2BucketCredentialRevoke.js"

const apiBaseUrl = "https://api.cloudflare.test/client/v4/"

test("creates a bucket-scoped R2 credential with request-scoped Cloudflare credentials", async () => {
  let request: { url: string; init: RequestInit } | undefined
  const result = await cloudflareR2BucketCredentialCreate({
    accountId: "account-1",
    apiToken: "request-token",
    bucket: "project-bucket",
    name: "project credential",
    apiBaseUrl,
    fetchImplementation: async (input, init) => {
      request = { url: String(input), init: init ?? {} }
      return new Response(JSON.stringify({ success: true, result: { id: "access-key", value: "token-value" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    },
  })

  expect(result).toEqual({
    success: true,
    data: {
      bucket: "project-bucket",
      accessKeyId: "access-key",
      secretAccessKey: "e6c02a5742ea9d4de588eb9b9de7bed43dc17011552186bed3e98b2c5958ff4a",
      revocationId: "access-key",
    },
  })
  expect(JSON.stringify(result)).not.toContain("token-value")
  expect(request?.url).toBe("https://api.cloudflare.test/client/v4/accounts/account-1/tokens")
  expect(request?.init.method).toBe("POST")
  expect(new Headers(request?.init.headers).get("authorization")).toBe("Bearer request-token")
  expect(JSON.parse(String(request?.init.body))).toMatchObject({
    name: "project credential",
    policies: [
      {
        effect: "allow",
        resources: { "com.cloudflare.edge.r2.bucket.account-1_default_project-bucket": "*" },
        permission_groups: [{ name: "Workers R2 Storage Bucket Item Write" }],
      },
    ],
  })
})

test("revokes a bucket credential and treats an already missing token as idempotent", async () => {
  const calls: string[] = []
  const fetchImplementation = async (input: string | URL | Request): Promise<Response> => {
    calls.push(String(input))
    return new Response(JSON.stringify({ success: true, result: null }), { status: 200 })
  }
  const revoked = await cloudflareR2BucketCredentialRevoke({
    accountId: "account-1",
    apiToken: "request-token",
    revocationId: "access-key",
    apiBaseUrl,
    fetchImplementation,
  })
  expect(revoked).toEqual({ success: true, data: true })
  expect(calls).toEqual(["https://api.cloudflare.test/client/v4/accounts/account-1/tokens/access-key"])

  const missing = await cloudflareR2BucketCredentialRevoke({
    accountId: "account-1",
    apiToken: "request-token",
    revocationId: "already-gone",
    apiBaseUrl,
    fetchImplementation: async () => new Response(JSON.stringify({ success: false }), { status: 404 }),
  })
  expect(missing).toEqual({ success: true, data: false })
})

test("redacts the request token from Cloudflare failures", async () => {
  const result = await cloudflareR2BucketCredentialRevoke({
    accountId: "account-1",
    apiToken: "request-token",
    revocationId: "access-key",
    fetchImplementation: async () => {
      throw new Error("Authorization: Bearer request-token")
    },
  })

  expect(result.success).toBe(false)
  expect(JSON.stringify(result)).not.toContain("request-token")
})

test("does not expose an invalid Cloudflare token response in errors", async () => {
  const generatedSecret = "generated-secret"
  const result = await cloudflareR2BucketCredentialCreate({
    accountId: "account-1",
    apiToken: "request-token",
    bucket: "project-bucket",
    apiBaseUrl,
    fetchImplementation: async () =>
      new Response(JSON.stringify({ success: true, result: { id: "", value: generatedSecret } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  })

  expect(result.success).toBe(false)
  expect(JSON.stringify(result)).not.toContain(generatedSecret)
})
